// channels-list module within subcommands/settings/channels
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	executeChannelList,
	formatError,
	parseBucket,
	parseBucketChoice,
	CHANNEL_BUCKETS,
	type ChannelChatInputInteraction,
	type ChannelCommand,
	denyInteraction
} from './utils';

export async function messageChannelList(command: ChannelCommand, message: Message, args: Args) {
	try {
		const bucket = await parseBucket(args, false);
		return executeChannelList({
			command,
			guildId: message.guildId ?? null,
			bucket,
			deny: (content) => message.reply({ content, allowedMentions: { users: [], roles: [] } }),
			respond: (content) => message.reply({ content, allowedMentions: { users: [], roles: [] } }),
			respondComponents: (components) =>
				message.reply({
					components,
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				})
		});
	} catch (error) {
		return message.reply({ content: formatError(error), allowedMentions: { users: [], roles: [] } });
	}
}

export async function chatInputChannelList(command: ChannelCommand, interaction: ChannelChatInputInteraction) {
	// If the user doesn't choose a setting, display all configured buckets.
	const selected = interaction.options.getString('setting');
	const bucket = selected ? parseBucketChoice(selected, CHANNEL_BUCKETS[0].key) : null;

	return executeChannelList({
		command,
		guildId: interaction.guildId ?? null,
		bucket,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({ content, allowedMentions: { users: [], roles: [] } }),
		respondComponents: (components) =>
			interaction.editReply({
				components,
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			}),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
