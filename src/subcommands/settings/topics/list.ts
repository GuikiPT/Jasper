import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { type TopicCommand, type TopicChatInputInteraction, denyInteraction, formatTopicList } from './utils';

const LIST_LIMIT = 20;

type TopicListContext = {
	command: TopicCommand;
	guildId: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export async function messageTopicList(command: TopicCommand, message: Message, _args: Args) {
	return handleTopicList({
		command,
		guildId: message.guildId ?? null,
		deny: (content) => message.reply(content),
		respond: (content) => message.reply(content)
	});
}

export async function chatInputTopicList(command: TopicCommand, interaction: TopicChatInputInteraction) {
	return handleTopicList({
		command,
		guildId: interaction.guildId ?? null,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

async function handleTopicList({ command, guildId, deny, respond, defer }: TopicListContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const topics = await command.container.database.guildTopic.findMany({
		where: { guildId },
		orderBy: { id: 'asc' }
	});

	if (topics.length === 0) {
		return respond('No topics configured yet. Add one with `/settings topic add`.');
	}

	const visible = topics.slice(0, LIST_LIMIT);
	const content = formatTopicList(visible);

	if (topics.length > LIST_LIMIT) {
		return respond(`${content}\n…and ${topics.length - LIST_LIMIT} more.`);
	}

	return respond(content);
}
