import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { Prisma } from '@prisma/client';

import { type TopicCommand, type TopicChatInputInteraction, denyInteraction, normalizeTopicValue, MAX_TOPIC_LENGTH } from './utils';

type TopicAddContext = {
	command: TopicCommand;
	guildId: string | null;
	value: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export async function messageTopicAdd(command: TopicCommand, message: Message, args: Args) {
	const value = await args.rest('string').catch(() => null);

	return handleTopicAdd({
		command,
		guildId: message.guildId ?? null,
		value,
		deny: (content) => message.reply(content),
		respond: (content) => message.reply(content)
	});
}

export async function chatInputTopicAdd(command: TopicCommand, interaction: TopicChatInputInteraction) {
	const value = interaction.options.getString('value', true);

	return handleTopicAdd({
		command,
		guildId: interaction.guildId ?? null,
		value,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

async function handleTopicAdd({ command, guildId, value, deny, respond, defer }: TopicAddContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (!value) {
		return deny('You need to provide a topic to add.');
	}

	const normalized = normalizeTopicValue(value);

	if (normalized.length === 0) {
		return respond('Topics cannot be empty.');
	}

	if (normalized.length > MAX_TOPIC_LENGTH) {
		return respond(`Topics must be ${MAX_TOPIC_LENGTH} characters or fewer.`);
	}

	if (defer) {
		await defer();
	}

	try {
		const created = await command.container.database.guildTopicSettings.create({
			data: { guildId, value: normalized }
		});

		return respond(`Saved topic #${created.id}.`);
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
			return respond('That topic already exists.');
		}

		command.container.logger.error('Failed to add topic', error);
		return respond('Failed to add the topic. Please try again later.');
	}
}
