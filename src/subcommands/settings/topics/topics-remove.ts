// topics-remove module within subcommands/settings/topics
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { type TopicCommand, type TopicChatInputInteraction, denyInteraction } from './utils';
import { Logger } from '../../../lib/logger';

type TopicRemoveContext = {
	command: TopicCommand;
	guildId: string | null;
	topicValue?: string | null;
	position?: number | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export async function messageTopicRemove(command: TopicCommand, message: Message, args: Args) {
	const result = await args.restResult('string');

	if (result.isErr()) {
		return message.reply('You need to provide either the topic text or position number (1, 2, 3...) from the topics list to remove.');
	}

	const input = result.unwrap().trim();

	// Try to parse as number first (position)
	const numericValue = parseInt(input, 10);
	if (!isNaN(numericValue) && numericValue > 0 && numericValue.toString() === input) {
		// Input is a valid positive integer, treat as position
		return handleTopicRemove({
			command,
			guildId: message.guildId ?? null,
			position: numericValue,
			deny: (content) => message.reply(content),
			respond: (content) => message.reply(content)
		});
	} else {
		// Input is text, treat as topic value
		return handleTopicRemove({
			command,
			guildId: message.guildId ?? null,
			topicValue: input,
			deny: (content) => message.reply(content),
			respond: (content) => message.reply(content)
		});
	}
}

export async function chatInputTopicRemove(command: TopicCommand, interaction: TopicChatInputInteraction) {
	const topicValue = interaction.options.getString('topic', false);
	const position = interaction.options.getInteger('position', false);

	// Require at least one parameter
	if (!topicValue && !position) {
		return denyInteraction(interaction, 'You must specify either a topic from the dropdown or a position number from the list.');
	}

	// Don't allow both parameters
	if (topicValue && position) {
		return denyInteraction(interaction, 'Please specify only one: either select from dropdown OR provide a position number, not both.');
	}

	return handleTopicRemove({
		command,
		guildId: interaction.guildId ?? null,
		topicValue,
		position,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

async function handleTopicRemove({ command, guildId, topicValue, position, deny, respond, defer }: TopicRemoveContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	// Validate inputs
	if (!topicValue && !position) {
		return respond('You must specify either a topic or a position number to remove.');
	}

	if (defer) {
		await defer();
	}

	const service = command.container.guildTopicSettingsService;
	if (!service) {
		Logger.error('Topic settings service is not available', undefined, { guildId: guildId ?? 'unknown', topicValue, position });
		return respond('Topics are not available right now. Please try again later.');
	}

	try {
		// Get all topics to work with
		const topics = await service.listTopics(guildId);

		if (topics.length === 0) {
			return respond('No topics are configured yet.');
		}

		let topicToRemove;

		if (position) {
			// Remove by position (1-based indexing from the list)
			if (position < 1 || position > topics.length) {
				return respond(`Invalid position. Please provide a number between 1 and ${topics.length}.`);
			}

			// Convert to 0-based index
			topicToRemove = topics[position - 1];
		} else if (topicValue) {
			// Remove by exact topic value match
			topicToRemove = topics.find(topic => topic.value === topicValue.trim());

			if (!topicToRemove) {
				return respond('No matching topic found. Make sure the topic text matches exactly.');
			}
		}

		if (!topicToRemove) {
			return respond('Could not find the specified topic.');
		}

		// Remove the topic using its ID
		const removedTopic = await service.removeTopic(guildId, topicToRemove.id);
		if (!removedTopic) {
			return respond('Failed to remove the topic.');
		}

		const preview = removedTopic.value.length > 80 ? `${removedTopic.value.slice(0, 77)}…` : removedTopic.value;
		const positionText = position ? ` (position #${position})` : '';
		return respond(`Removed topic #${removedTopic.id}${positionText}: ${preview}`);
	} catch (error) {
		Logger.error('Failed to remove topic', error, { guildId: guildId ?? 'unknown', topicValue, position });
		return respond('Failed to remove the topic. Please try again later.');
	}
}
