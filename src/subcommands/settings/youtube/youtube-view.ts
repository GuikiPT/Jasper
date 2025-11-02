// youtube-view module within subcommands/settings/youtube
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { GuildYouTubeSettingsService } from '../../../services/guildYouTubeSettingsService';
import { createComponentDetailsSection, createTextComponent, replyWithComponent, editReplyWithComponent } from '../../../lib/components';

export async function chatInputYouTubeView(command: Subcommand, interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		return replyWithComponent(interaction, '❌ This command can only be used in a server.', true);
	}

	// // Check permissions
	// if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
	// 	return replyWithComponent(interaction, '❌ You need the "Manage Channels" permission to view YouTube tracking settings.', true);
	// }

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(interaction.guild.id);

		if (!settings) {
			const message = `📺 **YouTube Tracking Settings**

YouTube subscriber count tracking is not configured for this server.`;

			return interaction.editReply({
				components: [createTextComponent(message)],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}

		const statusIcon = settings.enabled ? '✅' : '❌';
		const statusText = settings.enabled ? 'Enabled' : 'Disabled';

		return interaction.editReply({
			components: [
				createComponentDetailsSection({
					title: '📺 **YouTube Tracking Settings**',
					summary: `**Status:** ${statusIcon} ${statusText}`,
					details: [
						{ label: 'YouTube Channel', value: settings.youtubeChannelUrl || 'Not set' },
						{ label: 'Channel Name', value: settings.channelName || 'Not stored' },
						{ label: 'Discord Channel', value: settings.discordChannelId ? `<#${settings.discordChannelId}>` : 'Not set' },
						{ label: 'Update Interval', value: `${settings.updateIntervalMinutes} minutes` },
						{ label: 'Last Subscriber Count', value: settings.lastSubCount || 'Never updated' }
					],
					thumbnailUrl: settings.channelAvatarUrl || undefined
				})
			],
			flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error viewing settings:', error);
		return editReplyWithComponent(interaction, '❌ An error occurred while retrieving YouTube tracking settings. Please try again later.', true);
	}
}

export async function messageYouTubeView(command: Subcommand, message: Message) {
	if (!message.guild) {
		return message.reply('❌ This command can only be used in a server.');
	}

	// // Check permissions
	// if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
	// 	return message.reply('❌ You need the "Manage Channels" permission to view YouTube tracking settings.');
	// }

	const reply = await message.reply({
		components: [createTextComponent('🔄 Retrieving YouTube tracking settings...')],
		flags: MessageFlags.IsComponentsV2
	});

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(message.guild.id);

		if (!settings) {
			const responseMessage = `📺 **YouTube Tracking Settings**

YouTube subscriber count tracking is not configured for this server.`;

			return reply.edit({
				components: [createTextComponent(responseMessage)],
				flags: MessageFlags.IsComponentsV2
			});
		}

		const statusIcon = settings.enabled ? '✅' : '❌';
		const statusText = settings.enabled ? 'Enabled' : 'Disabled';

		return reply.edit({
			components: [
				createComponentDetailsSection({
					title: '📺 **YouTube Tracking Settings**',
					summary: `**Status:** ${statusIcon} ${statusText}`,
					details: [
						{ label: 'YouTube Channel', value: settings.youtubeChannelUrl || 'Not set' },
						{ label: 'Channel Name', value: settings.channelName || 'Not stored' },
						{ label: 'Discord Channel', value: settings.discordChannelId ? `<#${settings.discordChannelId}>` : 'Not set' },
						{ label: 'Update Interval', value: `${settings.updateIntervalMinutes} minutes` },
						{ label: 'Last Subscriber Count', value: settings.lastSubCount || 'Never updated' }
					],
					thumbnailUrl: settings.channelAvatarUrl || undefined
				})
			],
			flags: MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error viewing settings:', error);
		return reply.edit({
			components: [createTextComponent('❌ An error occurred while retrieving YouTube tracking settings. Please try again later.')],
			flags: MessageFlags.IsComponentsV2
		});
	}
}
