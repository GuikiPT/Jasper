// Reminder subcommand utilities - shared types and helper functions
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags, ContainerBuilder } from 'discord.js';

// Type aliases for reminder subcommands
export type ReminderCommand = Subcommand;
export type ReminderChatInputInteraction = Subcommand.ChatInputCommandInteraction;

// Send ephemeral reply with Components V2
export function replyEphemeral(interaction: ReminderChatInputInteraction, components: ContainerBuilder[]) {
	return interaction.reply({
		components,
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
	});
}
