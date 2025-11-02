// prefix-view module within subcommands/settings/prefix
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { executePrefixRequest, type PrefixChatInputInteraction, type PrefixCommand, ephemeralResponse, pickOptionalString } from './utils';

export async function messagePrefixView(command: PrefixCommand, message: Message, args: Args) {
	// Consume any stray arguments to avoid confusing errors.
	void pickOptionalString(args);

	return executePrefixRequest({
		command,
		guildId: message.guildId ?? null,
		providedPrefix: null,
		deny: (content) => message.reply(content),
		respond: (content) => message.reply(content)
	});
}

export async function chatInputPrefixView(command: PrefixCommand, interaction: PrefixChatInputInteraction) {
	return executePrefixRequest({
		command,
		guildId: interaction.guildId ?? null,
		providedPrefix: null,
		deny: (content) => ephemeralResponse(interaction, content),
		respond: (content) => interaction.editReply({ content }),
		respondComponents: (components) => interaction.editReply({ components }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
