// Channel add subcommand - adds channels to allowlist buckets
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

// Handle message command: !settings channels add <bucket> hannel>
export async function messageChannelAdd(command: ChannelCommand, message: Message, args: Args) {
	try {
		// Parse bucket key from arguments
		const bucket = (await parseBucket(args, true)) as ChannelBucketKey;
		// Parse channel from arguments
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

// Handle slash command: /settings channels add setting:<bucket> channel:hannel>
export async function chatInputChannelAdd(command: ChannelCommand, interaction: ChannelChatInputInteraction) {
	// Get bucket and channel from slash command options
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
