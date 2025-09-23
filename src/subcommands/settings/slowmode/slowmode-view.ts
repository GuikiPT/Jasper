import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

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
		respondComponents: async (components) => {
			if (!components || components.length === 0) return;
			return message.reply({
				components,
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			});
		},
		deny: (content) => message.reply({ content })
	});
}

export async function chatInputSlowmodeView(command: SlowmodeCommand, interaction: SlowmodeChatInputInteraction) {
	return executeSlowmodeView({
		command,
		guildId: interaction.guildId ?? null,
		respond: (content) => interaction.editReply({ content, allowedMentions: { users: [], roles: [] } }),
		respondComponents: (components) => interaction.editReply({
			components,
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		}),
		deny: (content) => denyInteraction(interaction, content),
		defer: () => deferInteraction(interaction)
	});
}
