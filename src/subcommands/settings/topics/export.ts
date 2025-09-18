import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { AttachmentBuilder, MessageFlags } from 'discord.js';

import { type TopicChatInputInteraction, type TopicCommand, denyInteraction } from './utils';

type TopicExportContext = {
	command: TopicCommand;
	guildId: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string, attachment?: AttachmentBuilder) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export async function messageTopicExport(command: TopicCommand, message: Message, _args: Args) {
	return handleTopicExport({
		command,
		guildId: message.guildId ?? null,
		deny: (content) => message.reply(content),
		respond: (content, attachment) => (attachment ? message.reply({ content, files: [attachment] }) : message.reply({ content }))
	});
}

export async function chatInputTopicExport(command: TopicCommand, interaction: TopicChatInputInteraction) {
	return handleTopicExport({
		command,
		guildId: interaction.guildId ?? null,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content, attachment) => (attachment ? interaction.editReply({ content, files: [attachment] }) : interaction.editReply({ content })),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

async function handleTopicExport({ command, guildId, deny, respond, defer }: TopicExportContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const topics = await command.container.database.topic.findMany({
		where: { guildId },
		orderBy: { id: 'asc' }
	});

	if (topics.length === 0) {
		return respond('No topics configured yet. Add one with `/settings topic add`.');
	}

	const payload = JSON.stringify(
		topics.map((topic) => topic.value),
		null,
		2
	);
	const attachment = new AttachmentBuilder(Buffer.from(`${payload}\n`, 'utf8'), { name: 'topics.json' });

	return respond(`Exported ${topics.length} topic(s).`, attachment);
}
