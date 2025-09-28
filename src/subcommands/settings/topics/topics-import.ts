// topics-import module within subcommands/settings/topics
import type { Args } from '@sapphire/framework';
import { FetchResultTypes, fetch } from '@sapphire/fetch';
import type { Message } from 'discord.js';
import { MessageFlags, type Attachment } from 'discord.js';

import {
	MAX_IMPORT_FILE_SIZE,
	MAX_TOPIC_LENGTH,
	MAX_TOPICS_PER_IMPORT,
	type TopicChatInputInteraction,
	type TopicCommand,
	denyInteraction,
	normalizeTopicValue
} from './utils';

type TopicImportContext = {
	command: TopicCommand;
	guildId: string | null;
	payload: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

type ImportResult = {
	valid: string[];
	invalidCount: number;
};

export async function messageTopicImport(command: TopicCommand, message: Message, args: Args) {
	const attachment = message.attachments.first() ?? null;
	const text = await args.restResult('string');
	const fallback = text.unwrapOr(null);

	let payload: string | null;
	try {
		payload = await resolvePayload({ attachment, fallback });
	} catch (error) {
		return message.reply(formatPayloadError(error));
	}

	return handleTopicImport({
		command,
		guildId: message.guildId ?? null,
		payload,
		deny: (content) => message.reply(content),
		respond: (content) => message.reply(content)
	});
}

export async function chatInputTopicImport(command: TopicCommand, interaction: TopicChatInputInteraction) {
	const attachment = interaction.options.getAttachment('file') ?? null;
	const text = interaction.options.getString('text');

	let payload: string | null;
	try {
		payload = await resolvePayload({ attachment, fallback: text });
	} catch (error) {
		return denyInteraction(interaction, formatPayloadError(error));
	}

	return handleTopicImport({
		command,
		guildId: interaction.guildId ?? null,
		payload,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

async function resolvePayload({ attachment, fallback }: { attachment: Attachment | null; fallback: string | null }): Promise<string | null> {
	if (attachment) {
		if (attachment.size && attachment.size > MAX_IMPORT_FILE_SIZE) {
			throw new Error(`Attachment exceeds the ${Math.floor(MAX_IMPORT_FILE_SIZE / 1024)}KB limit.`);
		}

		const url = attachment.url;
		if (!url) {
			throw new Error('Could not read the provided attachment.');
		}

		const contentType = attachment.contentType ?? '';
		if (contentType && !contentType.includes('json') && !contentType.includes('text')) {
			throw new Error('Attachment must be a JSON or text file.');
		}

		return fetch(url, FetchResultTypes.Text);
	}

	return fallback;
}

async function handleTopicImport({ command, guildId, payload, deny, respond, defer }: TopicImportContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (!payload) {
		return deny('Provide a JSON attachment or paste a JSON array of topics.');
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(payload);
	} catch (error) {
		return respond('Could not parse JSON. Ensure the file contains a JSON array of strings.');
	}

	const { valid, invalidCount } = sanitizeTopics(parsed);

	if (valid.length === 0) {
		return respond(
			invalidCount > 0
				? 'No valid topics found. Ensure entries are non-empty strings under 256 characters.'
				: 'No topics found in the provided JSON.'
		);
	}

	if (valid.length > MAX_TOPICS_PER_IMPORT) {
		valid.splice(MAX_TOPICS_PER_IMPORT);
	}

	if (defer) {
		await defer();
	}

	const unique = [...new Set(valid.map(normalizeTopicValue))].filter(Boolean);

	if (unique.length === 0) {
		return respond('No valid topics found after removing duplicates.');
	}

	const service = command.container.guildTopicSettingsService;
	if (!service) {
		command.container.logger.error('Topic settings service is not available');
		return respond('Topics are not available right now. Please try again later.');
	}

	let toInsert = unique;
	let existingSkipped = 0;

	try {
		const existing = await service.listTopics(guildId);
		const existingSet = new Set(existing.map((entry) => entry.value));
		if (existingSet.size > 0) {
			toInsert = unique.filter((value) => !existingSet.has(value));
			existingSkipped = unique.length - toInsert.length;
		}
	} catch (error) {
		command.container.logger.error('Failed to inspect existing topics', error);
		return respond('Failed to check existing topics. Please try again later.');
	}

	let created = 0;

	if (toInsert.length > 0) {
		try {
			created = await service.importTopics(guildId, toInsert);
		} catch (error) {
			command.container.logger.error('Failed to import topics', error);
			return respond('Failed to import topics. Please try again later.');
		}
	}

	const duplicateRemoved = valid.length > unique.length ? valid.length - unique.length : 0;
	const totalSkipped = duplicateRemoved + existingSkipped;
	const duplicateMessage = totalSkipped > 0 ? ` Skipped ${totalSkipped} duplicate entr${totalSkipped === 1 ? 'y' : 'ies'}.` : '';
	const invalidNote = invalidCount > 0 ? ` Skipped ${invalidCount} invalid entr${invalidCount === 1 ? 'y' : 'ies'}.` : '';
	const noNewMessage = created === 0 ? ' No new topics were added.' : '';

	return respond(`Imported ${created} topic(s).${duplicateMessage}${invalidNote}${noNewMessage}`.trim());
}

function sanitizeTopics(input: unknown): ImportResult {
	if (!Array.isArray(input)) {
		return { valid: [], invalidCount: 1 };
	}

	const valid: string[] = [];
	let invalidCount = 0;

	for (const entry of input) {
		if (typeof entry !== 'string') {
			invalidCount++;
			continue;
		}

		const normalized = normalizeTopicValue(entry);
		if (normalized.length === 0 || normalized.length > MAX_TOPIC_LENGTH) {
			invalidCount++;
			continue;
		}

		valid.push(normalized);
	}

	return { valid, invalidCount };
}

function formatPayloadError(error: unknown) {
	if (error instanceof Error) return error.message;
	return 'Failed to read the provided payload. Please try again.';
}
