// support-view module within subcommands/settings/support
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { createErrorTextComponent, createTextComponent } from '../../../lib/components.js';
import { executeSupportView, formatError, type SupportCommand, type SupportChatInputInteraction } from './utils';

export async function messageSupportView(command: SupportCommand, message: Message, _args: Args) {
	try {
		return executeSupportView({
			command,
			guildId: message.guild?.id ?? null,
			deny: (content) =>
				message.reply({
					components: [createErrorTextComponent(content)],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				}),
			respond: (content) =>
				message.reply({
					components: [createTextComponent(content)],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				}),
			respondComponents: (components) =>
				message.reply({
					components,
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				})
		});
	} catch (error) {
		return message.reply({
			components: [createErrorTextComponent(formatError(error))],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}
}

export async function chatInputSupportView(command: SupportCommand, interaction: SupportChatInputInteraction) {
	try {
		return executeSupportView({
			command,
			guildId: interaction.guild?.id ?? null,
			deny: (content) => interaction.editReply({ content, allowedMentions: { users: [], roles: [] } }),
			respond: (content) =>
				interaction.editReply({
					components: [createTextComponent(content)],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				}),
			respondComponents: (components) =>
				interaction.editReply({
					components,
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				}),
			defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
		});
	} catch (error) {
		return interaction.editReply({
			components: [createErrorTextComponent(formatError(error))],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}
}
