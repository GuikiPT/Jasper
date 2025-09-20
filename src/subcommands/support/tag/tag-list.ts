import type { GuildSupportTag } from '@prisma/client';
import { MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	replyEphemeral
} from './utils';
import { SUPPORT_TAG_LIST_CUSTOM_ID, SUPPORT_TAG_LIST_ITEMS_PER_PAGE } from './constants';

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

	const tagNames = tags.map((tag) => tag.name);

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const { createPaginatedComponentWithButtons, createPaginationButtons } = await import('../../../lib/components.js');

	const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
		'Support Tags',
		tagNames,
		'No support tags have been created yet.',
		SUPPORT_TAG_LIST_ITEMS_PER_PAGE
	);

	const buttons = createPaginationButtons(currentPage, totalPages, SUPPORT_TAG_LIST_CUSTOM_ID, {
		ownerId: interaction.user.id
	});
	const components = buttons.length > 0 ? [component, ...buttons] : [component];

	await interaction.editReply({
		components,
		flags: MessageFlags.IsComponentsV2
	});

	return interaction.fetchReply();
}
