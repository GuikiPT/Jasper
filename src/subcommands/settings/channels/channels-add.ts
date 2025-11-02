// channels-add module within subcommands/settings/channels
import type { Args } from '@sapphire/framework';
import type { GuildBasedChannel, Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	executeChannelMutation,
	formatError,
	parseBucket,
	type ChannelBucketKey,
	type ChannelChatInputInteraction,
	type ChannelCommand,
	denyInteraction
} from './utils';

export async function messageChannelAdd(command: ChannelCommand, message: Message, args: Args) {
	try {
		const bucket = (await parseBucket(args, true)) as ChannelBucketKey;
		const channel = (await args.pick('channel')) as GuildBasedChannel;

		return executeChannelMutation({
			command,
			guildId: message.guildId ?? null,
			bucket,
			channelId: channel.id,
			operation: 'add',
			deny: (content) => message.reply(content),
			respond: (content) => message.reply(content)
		});
	} catch (error) {
		return message.reply(formatError(error));
	}
}

export async function chatInputChannelAdd(command: ChannelCommand, interaction: ChannelChatInputInteraction) {
	const bucket = interaction.options.getString('setting', true) as ChannelBucketKey;
	const channel = interaction.options.getChannel('channel', true) as GuildBasedChannel;

	return executeChannelMutation({
		command,
		guildId: interaction.guildId ?? null,
		bucket,
		channelId: channel.id,
		operation: 'add',
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
