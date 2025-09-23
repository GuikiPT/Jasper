import type { Message } from 'discord.js';

import {
	executeSlowmodeView,
	denyInteraction,
	deferInteraction,
	type SlowmodeChatInputInteraction,
	type SlowmodeCommand
} from './utils';

export async function messageSlowmodeView(command: SlowmodeCommand, message: Message) {
	return executeSlowmodeView({
		command,
		guildId: message.guildId ?? null,
		respond: (content) => message.reply({ content }),
		deny: (content) => message.reply({ content })
	});
}

export async function chatInputSlowmodeView(command: SlowmodeCommand, interaction: SlowmodeChatInputInteraction) {
	return executeSlowmodeView({
		command,
		guildId: interaction.guildId ?? null,
		respond: (content) => interaction.editReply({ content }),
		deny: (content) => denyInteraction(interaction, content),
		defer: () => deferInteraction(interaction)
	});
}
