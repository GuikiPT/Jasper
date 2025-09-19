import type { Args } from '@sapphire/framework';
import { PaginatedMessage } from '@sapphire/discord.js-utilities';
import type { Message } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';

import { type TopicCommand, type TopicChatInputInteraction } from './utils';

const EMBED_DESCRIPTION_LIMIT = 4000;
const ITEMS_PER_PAGE = 10;
const EMPTY_TOPICS_MESSAGE = 'No topics configured yet. Add one with `/settings topic add`.';

export async function messageTopicList(command: TopicCommand, message: Message, _args: Args) {
	if (!message.guildId) {
		return message.reply('This command can only be used inside a server.');
	}

	const topics = await fetchTopics(command, message.guildId);
	if (topics.length === 0) {
		return message.reply(EMPTY_TOPICS_MESSAGE);
	}

	const paginatedMessage = createTopicPaginatedMessage(topics);
	return paginatedMessage.run(message, message.author);
}

export async function chatInputTopicList(command: TopicCommand, interaction: TopicChatInputInteraction) {
	if (!interaction.guildId) {
		return interaction.editReply({ content: 'This command can only be used inside a server.' });
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const topics = await fetchTopics(command, interaction.guildId);
	if (topics.length === 0) {
		return interaction.editReply({ content: EMPTY_TOPICS_MESSAGE });
	}

	const paginatedMessage = createTopicPaginatedMessage(topics);
	return paginatedMessage.run(interaction, interaction.user);
}

async function fetchTopics(command: TopicCommand, guildId: string) {
	return command.container.database.guildTopic.findMany({
		where: { guildId },
		orderBy: { id: 'asc' }
	});
}

function createTopicPaginatedMessage(topics: Array<{ id: number; value: string }>) {
	const paginatedMessage = new PaginatedMessage({
		template: new EmbedBuilder().setTitle('Discussion Topics')
	});

	const pages = buildTopicPages(topics);
	for (const description of pages) {
		paginatedMessage.addPageEmbed((embed) => embed.setDescription(description));
	}

	return paginatedMessage;
}

function buildTopicPages(topics: Array<{ value: string }>) {
	const pages: string[] = [];
	let buffer: string[] = [];
	let bufferLength = 0;

	const pushBuffer = () => {
		if (buffer.length === 0) return;
		pages.push(buffer.join('\n\n'));
		buffer = [];
		bufferLength = 0;
	};

	topics.forEach((topic, index) => {
		const line = `${index + 1}. ${topic.value}`;
		const projectedLength = bufferLength + line.length + (buffer.length > 0 ? 2 : 0);
		const topicCountReached = buffer.length >= ITEMS_PER_PAGE;
		const exceedsLimit = projectedLength > EMBED_DESCRIPTION_LIMIT;
		if (topicCountReached || exceedsLimit) {
			pushBuffer();
		}
		buffer.push(line);
		bufferLength += line.length + 2;
	});

	pushBuffer();

	return pages.length > 0 ? pages : ['No topics to display.'];
}
