import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	type TopicCommand,
	type TopicChatInputInteraction,
	TOPIC_LIST_CUSTOM_ID,
	TOPIC_LIST_ITEMS_PER_PAGE,
	TOPIC_LIST_EMPTY_MESSAGE
} from './utils';

export async function messageTopicList(command: TopicCommand, message: Message, _args: Args) {
	if (!message.guildId) {
		return message.reply({ content: 'This command can only be used inside a server.', allowedMentions: { users: [], roles: [] } });
	}

	let topics = [] as Array<{ value: string }>;
	try {
		topics = await fetchTopics(command, message.guildId);
	} catch (error) {
		command.container.logger.error('Failed to load topic list (message)', error);
		return message.reply({ content: 'Failed to load topics. Please try again later.', allowedMentions: { users: [], roles: [] } });
	}
	if (topics.length === 0) {
		return message.reply({ content: TOPIC_LIST_EMPTY_MESSAGE, allowedMentions: { users: [], roles: [] } });
	}

	const topicValues = topics.map((topic) => topic.value);

	// Import components dynamically to avoid circular dependencies
	const { createPaginatedComponentWithButtons, createPaginationButtons } = await import('../../../lib/components.js');

	// Create paginated component with navigation buttons
	const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
		'Discussion Topics',
		topicValues,
		TOPIC_LIST_EMPTY_MESSAGE,
		TOPIC_LIST_ITEMS_PER_PAGE
	);

	const buttons = createPaginationButtons(currentPage, totalPages, TOPIC_LIST_CUSTOM_ID, {
		ownerId: message.author.id
	});

	return message.reply({
		components: [component, ...buttons],
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: { users: [], roles: [] }
	});
}

export async function chatInputTopicList(command: TopicCommand, interaction: TopicChatInputInteraction) {
	if (!interaction.guildId) {
		return interaction.reply({ content: 'This command can only be used inside a server.', flags: MessageFlags.Ephemeral });
	}

	let topics = [] as Array<{ value: string }>;
	try {
		topics = await fetchTopics(command, interaction.guildId);
	} catch (error) {
		command.container.logger.error('Failed to load topic list (chat input)', error);
		return interaction.reply({ content: 'Failed to load topics. Please try again later.', flags: MessageFlags.Ephemeral });
	}
	if (topics.length === 0) {
		return interaction.reply({ content: TOPIC_LIST_EMPTY_MESSAGE, flags: MessageFlags.Ephemeral });
	}

	const topicValues = topics.map((topic) => topic.value);

	// Import components dynamically to avoid circular dependencies
	const { createPaginatedComponentWithButtons, createPaginationButtons } = await import('../../../lib/components.js');

	// Create paginated component with navigation buttons
	const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
		'Discussion Topics',
		topicValues,
		TOPIC_LIST_EMPTY_MESSAGE,
		TOPIC_LIST_ITEMS_PER_PAGE
	);

	const buttons = createPaginationButtons(currentPage, totalPages, TOPIC_LIST_CUSTOM_ID, {
		ownerId: interaction.user.id
	});

	return interaction.reply({
		components: [component, ...buttons],
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
		allowedMentions: { users: [], roles: [] }
	});
}

async function fetchTopics(command: TopicCommand, guildId: string) {
	return command.container.database.guildTopicSettings.findMany({
		where: { guildId },
		orderBy: { id: 'asc' }
	});
}
