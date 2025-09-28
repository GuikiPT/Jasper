// tag-list module within subcommands/support/tag
import { MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	replyEphemeral
} from './utils';

import {
	SUPPORT_TAG_LIST_CUSTOM_ID,
	SUPPORT_TAG_LIST_ITEMS_PER_PAGE
} from './constants';

const SUPPORT_TAG_LIST_EMPTY_MESSAGE = 'No support tags have been created yet.';

export async function chatInputTagList(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId!;

	const service = command.container.supportTagService;
	if (!service) {
		command.container.logger.error('Support tag service is not initialised');
		return replyEphemeral(interaction, 'Support tags are not available right now. Please try again later.');
	}

	let tags;
	try {
		tags = await service.listTags(guildId);
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return replyEphemeral(interaction, SUPPORT_TAG_TABLE_MISSING_MESSAGE);
		}
		command.container.logger.error('Failed to load tag list (chat input)', error);
		return replyEphemeral(interaction, 'Failed to load tags. Please try again later.');
	}

	if (tags.length === 0) {
		return replyEphemeral(interaction, SUPPORT_TAG_LIST_EMPTY_MESSAGE);
	}

	const tagNames = tags.map((tag) => tag.name);

	// Import components dynamically to avoid circular dependencies
	const { createPaginatedComponentWithButtons, createPaginationButtons } = await import('../../../lib/components.js');

	// Create paginated component with navigation buttons
	const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
		'Support Tags',
		tagNames,
		SUPPORT_TAG_LIST_EMPTY_MESSAGE,
		SUPPORT_TAG_LIST_ITEMS_PER_PAGE
	);

	const buttons = createPaginationButtons(currentPage, totalPages, SUPPORT_TAG_LIST_CUSTOM_ID, {
		ownerId: interaction.user.id
	});

	return interaction.reply({
		components: [component, ...buttons],
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
		allowedMentions: { users: [], roles: [] }
	});
}
