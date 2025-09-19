import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { executeSupportView, denyInteraction, formatError, type SupportCommand, type SupportChatInputInteraction } from './utils';

export async function messageSupportView(command: SupportCommand, message: Message, _args: Args) {
	try {
		return executeSupportView({
			command,
			guildId: message.guild?.id ?? null,
			deny: (content) => message.reply(content),
			respond: (content) => message.reply(content)
		});
	} catch (error) {
		return message.reply(formatError(error));
	}
}

export async function chatInputSupportView(command: SupportCommand, interaction: SupportChatInputInteraction) {
	try {
		return executeSupportView({
			command,
			guildId: interaction.guild?.id ?? null,
			deny: (content) => denyInteraction(interaction, content),
			respond: (content) => interaction.editReply({ content }),
			defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
		});
	} catch (error) {
		return denyInteraction(interaction, formatError(error));
	}
}