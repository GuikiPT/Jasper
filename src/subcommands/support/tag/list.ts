import type { GuildSupportTag } from '@prisma/client';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	replyEphemeral
} from './utils';

export async function chatInputTagList(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	let tags: GuildSupportTag[];
	try {
		tags = await command.container.database.guildSupportTag.findMany({
			where: { guildId },
			orderBy: { name: 'asc' }
		});
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return replyEphemeral(interaction, SUPPORT_TAG_TABLE_MISSING_MESSAGE);
		}
		throw error;
	}

	if (tags.length === 0) {
		return replyEphemeral(interaction, 'No support tags have been created yet.');
	}

	const entries = tags.map((tag: GuildSupportTag) => `• ${tag.name}`);
	const content = entries.join('\n');

	if (content.length > 1_900) {
		return replyEphemeral(
			interaction,
			`There are ${tags.length} tags. Please refine your query or delete unused tags.`
		);
	}

	return replyEphemeral(interaction, content);
}
