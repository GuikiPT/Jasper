// Channel remove subcommand - removes channels from allowlist buckets
import type { Args } from '@sapphire/framework';
import type { GuildBasedChannel, Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	executeChannelMutation,
	formatError,
	parseBucket,
	parseChannelId,
	type ChannelBucketKey,
	type ChannelChatInputInteraction,
	type ChannelCommand,
	denyInteraction
} from './utils';

// Handle message command: !settings channels remove <bucket> hannel>
export async function messageChannelRemove(command: ChannelCommand, message: Message, args: Args) {
	try {
		// Parse bucket key from arguments
		const bucket = (await parseBucket(args, true)) as ChannelBucketKey;

		// Try to parse channel from arguments
		let channelId: string;
		const channelResult = await args.pickResult('channel');

		if (channelResult.isOk()) {
			// Successfully parsed channel object
			const channel = channelResult.unwrap() as GuildBasedChannel;
			channelId = channel.id;
		} else {
			// Failed to parse channel - try to extract channel ID from string
			const channelString = await args.pick('string');
			const parsed = parseChannelId(channelString);

			if (!parsed) {
				return message.reply(
					'Invalid channel reference. Please provide a channel mention, channel ID, or Discord channel URL.'
				);
			}

			channelId = parsed;
		}

		return executeChannelMutation({
			command,
			guildId: message.guildId ?? null,
			bucket,
			channelId,
			operation: 'remove',
			deny: (content) => message.reply(content),
			respond: (content) => message.reply(content)
		});
	} catch (error) {
		return message.reply(formatError(error));
	}
}

// Handle slash command: /settings channels remove setting:<bucket> channel:hannel>
export async function chatInputChannelRemove(command: ChannelCommand, interaction: ChannelChatInputInteraction) {
	// Get bucket from slash command options
	const bucket = interaction.options.getString('setting', true) as ChannelBucketKey;

	// Get channel - either from channel picker or channel_id string
	const channel = interaction.options.getChannel('channel');
	const channelIdString = interaction.options.getString('channel_id');

	// Validate that at least one channel identifier is provided
	if (!channel && !channelIdString) {
		return denyInteraction(interaction, 'You must provide either a channel or a channel ID/link.');
	}

	// If both are provided, prefer the channel picker
	if (channel && channelIdString) {
		return denyInteraction(interaction, 'Please provide either a channel OR a channel ID, not both.');
	}

	let channelId: string;

	// Extract channel ID
	if (channel) {
		channelId = channel.id;
	} else {
		// Parse channel ID from string (ID, mention, or URL)
		const parsed = parseChannelId(channelIdString!);
		if (!parsed) {
			return denyInteraction(
				interaction,
				'Invalid channel ID or link. Please provide a valid channel ID, mention (<#123456789>), or Discord channel URL.'
			);
		}
		channelId = parsed;
	}

	return executeChannelMutation({
		command,
		guildId: interaction.guildId ?? null,
		bucket,
		channelId,
		operation: 'remove',
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
