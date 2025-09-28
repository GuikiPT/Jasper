import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	TOPIC_LIST_CUSTOM_ID,
	TOPIC_LIST_EMPTY_MESSAGE,
	TOPIC_LIST_ITEMS_PER_PAGE
} from '../subcommands/settings/topics/utils';

interface PaginationMetadata {
	ownerId: string;
	targetPage: number;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class TopicListPaginationHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const segments = interaction.customId.split(':');
		if (segments.length !== 4) {
			return this.none();
		}

		const [base, ownerId, action, rawPage] = segments;
		if (base !== TOPIC_LIST_CUSTOM_ID) {
			return this.none();
		}

		if (!ownerId || (action !== 'prev' && action !== 'next')) {
			return this.none();
		}

		const targetPage = Number.parseInt(rawPage, 10);
		if (!Number.isFinite(targetPage)) {
			return this.none();
		}

		return this.some<PaginationMetadata>({ ownerId, targetPage: Math.max(1, targetPage) });
	}

	public override async run(interaction: ButtonInteraction, data: PaginationMetadata) {
		if (interaction.user.id !== data.ownerId) {
			return interaction.reply({
				content: 'Only the user who ran this command can use these controls.',
				flags: MessageFlags.Ephemeral
			});
		}

		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({
				content: 'This component can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		const service = this.container.guildTopicSettingsService;
		if (!service) {
			this.container.logger.error('Topic settings service is not available');
			return interaction.reply({
				content: 'Topics are not available right now. Please try again later.',
				flags: MessageFlags.Ephemeral
			});
		}

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

		const topicValues = topics.map((topic) => topic.value);
		const requestedPage = data.targetPage;

		const {
			createPaginatedComponentWithButtons,
			createPaginationButtons
		} = await import('../lib/components.js');

		const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
			'Discussion Topics',
			topicValues,
			TOPIC_LIST_EMPTY_MESSAGE,
			TOPIC_LIST_ITEMS_PER_PAGE,
			requestedPage
		);

		const buttons = createPaginationButtons(currentPage, totalPages, TOPIC_LIST_CUSTOM_ID, {
			ownerId: data.ownerId
		});
		const components = buttons.length > 0 ? [component, ...buttons] : [component];

		return interaction.update({ components });
	}
}
