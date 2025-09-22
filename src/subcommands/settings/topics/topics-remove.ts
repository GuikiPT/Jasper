import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { type TopicCommand, type TopicChatInputInteraction, denyInteraction } from './utils';
import { Logger } from '../../../lib/logger';

type TopicRemoveContext = {
	command: TopicCommand;
	guildId: string | null;
	id: number | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export async function messageTopicRemove(command: TopicCommand, message: Message, args: Args) {
	const result = await args.pickResult('integer');

	if (result.isErr()) {
		return message.reply('You need to provide the numeric topic id to remove.');
	}

	return handleTopicRemove({
		command,
		guildId: message.guildId ?? null,
		id: result.unwrap(),
		deny: (content) => message.reply(content),
		respond: (content) => message.reply(content)
	});
}

export async function chatInputTopicRemove(command: TopicCommand, interaction: TopicChatInputInteraction) {
	const id = interaction.options.getInteger('id', true);

	return handleTopicRemove({
		command,
		guildId: interaction.guildId ?? null,
		id,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

async function handleTopicRemove({ command, guildId, id, deny, respond, defer }: TopicRemoveContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
		return respond('Topic ids are positive integers.');
	}

	if (defer) {
		await defer();
	}

	try {
		const topic = await command.container.database.guildTopicSettings.findFirst({
			where: { guildId, id }
		});

		if (!topic) {
			return 'No matching topic found.';
		}

		await command.container.database.guildTopicSettings.delete({ where: { id } }); const preview = topic.value.length > 80 ? `${topic.value.slice(0, 77)}…` : topic.value;
		return respond(`Removed topic #${topic.id}: ${preview}`);
	} catch (error) {
		Logger.error('Failed to remove topic', error, { guildId: guildId ?? 'unknown', id });
		return respond('Failed to remove the topic. Please try again later.');
	}
}
