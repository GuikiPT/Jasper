// Topics pagination handler - handles page navigation for discussion topics list
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { TOPIC_LIST_CUSTOM_ID, TOPIC_LIST_EMPTY_MESSAGE, TOPIC_LIST_ITEMS_PER_PAGE } from '../subcommands/settings/topics/utils';

// Parsed pagination metadata from button custom ID
interface PaginationMetadata {
	ownerId: string;
	targetPage: number;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class TopicListPaginationHandler extends InteractionHandler {
	// Parse button custom ID and extract pagination metadata
	public override parse(interaction: ButtonInteraction) {
		try {
			// Expected format: customId:ownerId:action:page
			const segments = interaction.customId.split(':');
			if (segments.length !== 4) {
				return this.none();
			}

			const [base, ownerId, action, rawPage] = segments;

			// Validate custom ID prefix
			if (base !== TOPIC_LIST_CUSTOM_ID) {
				return this.none();
			}

			// Validate action type
			if (!ownerId || (action !== 'prev' && action !== 'next')) {
				return this.none();
			}

			// Parse target page number
			const targetPage = Number.parseInt(rawPage, 10);
			if (!Number.isFinite(targetPage)) {
				return this.none();
			}

			return this.some<PaginationMetadata>({ ownerId, targetPage: Math.max(1, targetPage) });
		} catch (error) {
			this.container.logger.error('Failed to parse topic list pagination interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id,
				customId: interaction.customId
			});
			return this.none();
		}
	}

	// Handle pagination button click
	public override async run(interaction: ButtonInteraction, data: PaginationMetadata) {
		try {
			// Verify button owner
			if (interaction.user.id !== data.ownerId) {
				return interaction.reply({
					content: 'Only the user who ran this command can use these controls.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Validate guild context
			const guildId = interaction.guildId;
			if (!guildId) {
				return interaction.reply({
					content: 'This component can only be used inside a server.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Get topic settings service
			const service = this.container.guildTopicSettingsService;
			if (!service) {
				this.container.logger.error('Topic settings service is not available');
				return interaction.reply({
					content: 'Topics are not available right now. Please try again later.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Fetch all topics for guild
			let topics;
			try {
				topics = await service.listTopics(guildId);
			} catch (error) {
				this.container.logger.error('Failed to load topics for pagination', error);
				return interaction.reply({
					content: 'Unable to refresh the topic list right now. Please try again later.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Extract topic values for display
			const topicValues = topics.map((topic) => topic.value);
			const requestedPage = data.targetPage;

			// Import components dynamically to avoid circular dependencies
			const { createPaginatedComponentWithButtons, createPaginationButtons } = await import('../lib/components.js');

			// Create paginated list with new page number
			const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
				'Discussion Topics',
				topicValues,
				TOPIC_LIST_EMPTY_MESSAGE,
				TOPIC_LIST_ITEMS_PER_PAGE,
				requestedPage
			);

			// Create navigation buttons for new page
			const buttons = createPaginationButtons(currentPage, totalPages, TOPIC_LIST_CUSTOM_ID, {
				ownerId: data.ownerId
			});
			const components = buttons.length > 0 ? [component, ...buttons] : [component];

			// Update message with new page
			return interaction.update({ components });
		}
		catch (error) {
			this.container.logger.error('Failed to process topic list pagination interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id
			});
			return interaction.reply({
				content: 'An error occurred while processing the topic list. Please try again later.',
				flags: MessageFlags.Ephemeral
			});
		}
	}
}
