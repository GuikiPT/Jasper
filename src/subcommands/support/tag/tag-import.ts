import { MessageFlags } from 'discord.js';
import { FetchResultTypes, fetch } from '@sapphire/fetch';
import type { Attachment } from 'discord.js';

import {
	NormalizedImportEntry,
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	TransactionClient,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeImportEntry,
	replyEphemeral
} from './utils';

const MAX_IMPORT_FILE_SIZE = 512_000; // 500KB
const MAX_TAGS_PER_IMPORT = 100;

export async function chatInputTagImport(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	const attachment = interaction.options.getAttachment('file') ?? null;
	const payloadText = interaction.options.getString('payload');
	const overwrite = interaction.options.getBoolean('overwrite') ?? false;

	let payload: string | null;
	try {
		payload = await resolvePayload({ attachment, fallback: payloadText });
	} catch (error) {
		return replyEphemeral(interaction, formatPayloadError(error));
	}

	if (!payload) {
		return replyEphemeral(interaction, 'Provide a JSON attachment or paste JSON data containing tags to import.');
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(payload);
	} catch (error) {
		command.container.logger.warn('Support tag import failed to parse JSON', error);
		return replyEphemeral(interaction, 'The payload is not valid JSON.');
	}

	// Handle both array format (legacy) and object format (like the attached file)
	let entries: NormalizedImportEntry[] = [];

	if (Array.isArray(parsed)) {
		// Legacy array format
		if (parsed.length === 0) {
			return replyEphemeral(interaction, 'The payload must be a non-empty JSON array.');
		}

		for (const raw of parsed) {
			const normalized = normalizeImportEntry(raw);
			if (!normalized.ok) {
				return replyEphemeral(interaction, `Invalid tag entry encountered: ${normalized.reason}`);
			}
			entries.push(normalized.value);
		}
	} else if (typeof parsed === 'object' && parsed !== null) {
		// Object format (like the attached file structure)
		const tagObject = parsed as Record<string, unknown>;

		for (const [tagName, tagData] of Object.entries(tagObject)) {
			if (typeof tagData !== 'object' || tagData === null) {
				return replyEphemeral(interaction, `Invalid tag data for "${tagName}": must be an object.`);
			}

			// Convert object format to our normalized format
			const tagDataObj = tagData as Record<string, unknown>;
			const normalized = normalizeImportEntry({
				name: tagName,
				title: tagDataObj.title,
				description: tagDataObj.description,
				footer: tagDataObj.footer,
				image: tagDataObj.imageUrl,
				authorId: tagDataObj.authorId,
				editedBy: tagDataObj.editedBy
			});

			if (!normalized.ok) {
				return replyEphemeral(interaction, `Invalid tag entry for "${tagName}": ${normalized.reason}`);
			}
			entries.push(normalized.value);
		}
	} else {
		return replyEphemeral(interaction, 'The payload must be a JSON array or object containing tag data.');
	}

	if (entries.length === 0) {
		return replyEphemeral(interaction, 'No valid tags found in the provided data.');
	}

	if (entries.length > MAX_TAGS_PER_IMPORT) {
		entries = entries.slice(0, MAX_TAGS_PER_IMPORT);
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	let created = 0;
	let updated = 0;

	try {
		await command.container.database.$transaction(async (tx: TransactionClient) => {
			if (overwrite) {
				await tx.guildSupportTagSettings.deleteMany({ where: { guildId } });
			}

			for (const entry of entries) {
				const existing = overwrite
					? null
					: await tx.guildSupportTagSettings.findFirst({
						where: {
							guildId,
							name: entry.name
						}
					});

				if (!existing) {
					await tx.guildSupportTagSettings.create({
						data: {
							guildId,
							name: entry.name,
							authorId: entry.authorId ?? interaction.user.id,
							editedBy: entry.editedBy ?? null,
							embedTitle: entry.title,
							embedDescription: entry.description ?? null,
							embedFooter: entry.footer ?? null,
							embedImageUrl: entry.image ?? null
						}
					});
					created += 1;
					continue;
				}

				await tx.guildSupportTagSettings.update({
					where: { id: existing.id },
					data: {
						name: entry.name,
						embedTitle: entry.title,
						embedDescription: entry.description ?? null,
						embedFooter: entry.footer ?? null,
						embedImageUrl: entry.image ?? null,
						editedBy: interaction.user.id
					}
				});
				updated += 1;
			}
		});

		const suffix = overwrite
			? `Imported ${created} tag${created === 1 ? '' : 's'}.`
			: `Imported ${created} new tag${created === 1 ? '' : 's'} and updated ${updated} existing.`;

		return interaction.editReply({ content: suffix });
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
		}
		command.container.logger.error('Failed to import support tags', error);
		return interaction.editReply({ content: 'Unable to import tags right now. Please try again later.' });
	}
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

function formatPayloadError(error: unknown) {
	if (error instanceof Error) return error.message;
	return 'Failed to read the provided payload. Please try again.';
}
