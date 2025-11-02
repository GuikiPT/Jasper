// youtube-disable module within subcommands/settings/youtube
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { GuildYouTubeSettingsService } from '../../../services/guildYouTubeSettingsService';
import { createTextComponent, replyWithComponent, editReplyWithComponent } from '../../../lib/components';

export async function chatInputYouTubeDisable(command: Subcommand, interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		return replyWithComponent(interaction, '❌ This command can only be used in a server.', true);
	}

	// // Check permissions
	// if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
	// 	return replyWithComponent(interaction, '❌ You need the "Manage Channels" permission to configure YouTube tracking.', true);
	// }

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(interaction.guild.id);
		if (!settings || !settings.enabled) {
			return editReplyWithComponent(interaction, '❌ YouTube tracking is not currently enabled for this server.', true);
		}

		await GuildYouTubeSettingsService.disableTracking(interaction.guild.id);

		// Tracking will stop automatically when disabled

		const successMessage = `✅ **YouTube Tracking Disabled**

YouTube subscriber count tracking has been disabled for this server.`;

		return interaction.editReply({
			components: [createTextComponent(successMessage)],
			flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error disabling tracking:', error);
		return editReplyWithComponent(interaction, '❌ An error occurred while disabling YouTube tracking. Please try again later.', true);
	}
}

export async function messageYouTubeDisable(command: Subcommand, message: Message) {
	if (!message.guild) {
		return message.reply('❌ This command can only be used in a server.');
	}

	// // Check permissions
	// if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
	// 	return message.reply('❌ You need the "Manage Channels" permission to configure YouTube tracking.');
	// }

	const reply = await message.reply({
		components: [createTextComponent('🔄 Disabling YouTube tracking...')],
		flags: MessageFlags.IsComponentsV2
	});

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(message.guild.id);
		if (!settings || !settings.enabled) {
			return reply.edit({
				components: [createTextComponent('❌ YouTube tracking is not currently enabled for this server.')],
				flags: MessageFlags.IsComponentsV2
			});
		}

		await GuildYouTubeSettingsService.disableTracking(message.guild.id);

		// Tracking will stop automatically when disabled

		const successMessage = `✅ **YouTube Tracking Disabled**

YouTube subscriber count tracking has been disabled for this server.`;

		return reply.edit({
			components: [createTextComponent(successMessage)],
			flags: MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error disabling tracking:', error);
		return reply.edit({
			components: [createTextComponent('❌ An error occurred while disabling YouTube tracking. Please try again later.')],
			flags: MessageFlags.IsComponentsV2
		});
	}
}
