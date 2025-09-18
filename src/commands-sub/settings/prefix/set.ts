import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	executePrefixRequest,
	type PrefixChatInputInteraction,
	type PrefixCommand,
	ephemeralResponse
} from './utils';

export async function messagePrefixSet(command: PrefixCommand, message: Message, args: Args) {
	const providedPrefix = await args.pick('string').catch(() => null);

	if (!providedPrefix) {
		return message.reply('You must provide a new prefix to set.');
	}

	return executePrefixRequest({
		command,
		guildId: message.guildId ?? null,
		providedPrefix,
		deny: (content) => message.reply(content),
		respond: (content) => message.reply(content)
	});
}

export async function chatInputPrefixSet(command: PrefixCommand, interaction: PrefixChatInputInteraction) {
	const providedPrefix = interaction.options.getString('value', true);

	return executePrefixRequest({
		command,
		guildId: interaction.guildId ?? null,
		providedPrefix,
		deny: (content) => ephemeralResponse(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
