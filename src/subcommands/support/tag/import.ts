import { MessageFlags } from 'discord.js';

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

export async function chatInputTagImport(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	const payload = interaction.options.getString('payload', true);
	const overwrite = interaction.options.getBoolean('overwrite') ?? false;

	let parsed: unknown;

	try {
		parsed = JSON.parse(payload);
	} catch (error) {
		command.container.logger.warn('Support tag import failed to parse JSON', error);
		return replyEphemeral(interaction, 'The payload is not valid JSON.');
	}

	if (!Array.isArray(parsed) || parsed.length === 0) {
		return replyEphemeral(interaction, 'The payload must be a non-empty JSON array.');
	}

	const entries: NormalizedImportEntry[] = [];

	for (const raw of parsed) {
		const normalized = normalizeImportEntry(raw);
		if (!normalized.ok) {
			return replyEphemeral(interaction, `Invalid tag entry encountered: ${normalized.reason}`);
		}
		entries.push(normalized.value);
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	let created = 0;
	let updated = 0;

	try {
		await command.container.database.$transaction(async (tx: TransactionClient) => {
			if (overwrite) {
				await tx.guildSupportTag.deleteMany({ where: { guildId } });
			}

			for (const entry of entries) {
				const existing = overwrite
					? null
					: await tx.guildSupportTag.findFirst({
						where: {
							guildId,
							name: entry.name
						}
					});

				if (!existing) {
					await tx.guildSupportTag.create({
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

				await tx.guildSupportTag.update({
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
