import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import type { Args } from '@sapphire/framework';
import { GuildYouTubeSettingsService } from '../../../services/guildYouTubeSettingsService.js';
import { YouTubeService } from '../../../services/youtubeService.js';
import { createComponentDetailsSection, createTextComponent, replyWithComponent } from '../../../lib/components.js';
import { Logger } from '../../../lib/logger.js';

export async function chatInputYouTubeForceUpdate(_command: Subcommand, interaction: ChatInputCommandInteraction) {
	if (!interaction.guildId) {
		return replyWithComponent(interaction, '❌ This command can only be used in a server.', true);
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(interaction.guildId);
		if (!settings || !settings.enabled) {
			const message = `❌ **YouTube Tracking Disabled**

YouTube subscriber tracking is not enabled for this server. Use \`/settings youtube enable\` to enable it first.`;

			return interaction.editReply({
				components: [createTextComponent(message)],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}

		if (!settings.youtubeChannelUrl) {
			const message = `❌ **No Channel Configured**

No YouTube channel URL has been configured. Use \`/settings youtube enable\` to set up the channel.`;

			return interaction.editReply({
				components: [createTextComponent(message)],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}

		// Force update the subscriber count
		const result = await YouTubeService.getInstance().forceUpdate(interaction.guildId);

		if (result.success) {
			return interaction.editReply({
				components: [
					createComponentDetailsSection({
						title: '✅ **Force Update Successful**',
						summary: `Successfully updated subscriber count for channel: **${settings.youtubeChannelUrl}**`,
						details: [
							{ label: 'Channel Name', value: settings.channelName || 'Not stored' },
							{ label: 'Current Subscribers', value: result.currentCount?.toLocaleString() || 'Unknown' },
							{ label: 'Last Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>` }
						],
						thumbnailUrl: settings.channelAvatarUrl || undefined
					})
				],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		} else {
			const message = `❌ **Force Update Failed**

${result.message || 'An unknown error occurred while updating the subscriber count.'}`;

			return interaction.editReply({
				components: [createTextComponent(message)],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}
	} catch (error) {
		Logger.error('Error in YouTube force update subcommand', error, { guildId: interaction.guildId });

		const message = `❌ **Error**

An error occurred while processing the force update request.`;

		return interaction.editReply({
			components: [createTextComponent(message)],
			flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		});
	}
}

export async function messageYouTubeForceUpdate(_command: Subcommand, message: Message, _args: Args) {
	if (!message.guildId) {
		return message.reply({
			components: [createTextComponent('❌ This command can only be used in a server.')],
			flags: MessageFlags.IsComponentsV2
		});
	}

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(message.guildId);
		if (!settings || !settings.enabled) {
			const messageText = `❌ **YouTube Tracking Disabled**

YouTube subscriber tracking is not enabled for this server. Use \`/settings youtube enable\` to enable it first.`;

			return message.reply({
				components: [createTextComponent(messageText)],
				flags: MessageFlags.IsComponentsV2
			});
		}

		if (!settings.youtubeChannelUrl) {
			const messageText = `❌ **No Channel Configured**

No YouTube channel URL has been configured. Use \`/settings youtube enable\` to set up the channel.`;

			return message.reply({
				components: [createTextComponent(messageText)],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Send initial processing message
		const processingMessage = `⏳ **Processing Force Update**

Forcing an update of the YouTube subscriber count...`;

		const reply = await message.reply({
			components: [createTextComponent(processingMessage)],
			flags: MessageFlags.IsComponentsV2
		});

		// Force update the subscriber count
		const result = await YouTubeService.getInstance().forceUpdate(message.guildId);

		if (result.success) {
			return reply.edit({
				components: [
					createComponentDetailsSection({
						title: '✅ **Force Update Successful**',
						summary: `Successfully updated subscriber count for channel: **${settings.youtubeChannelUrl}**`,
						details: [
							{ label: 'Channel Name', value: settings.channelName || 'Not stored' },
							{ label: 'Current Subscribers', value: result.currentCount?.toLocaleString() || 'Unknown' },
							{ label: 'Last Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>` }
						],
						thumbnailUrl: settings.channelAvatarUrl || undefined
					})
				],
				flags: MessageFlags.IsComponentsV2
			});
		} else {
			const errorMessage = `❌ **Force Update Failed**

${result.message || 'An unknown error occurred while updating the subscriber count.'}`;

			return reply.edit({
				components: [createTextComponent(errorMessage)],
				flags: MessageFlags.IsComponentsV2
			});
		}
	} catch (error) {
		Logger.error('Error in YouTube force update subcommand', error, { guildId: message.guildId });

		const errorMessage = `❌ **Error**

An error occurred while processing the force update request.`;

		return message.reply({
			components: [createTextComponent(errorMessage)],
			flags: MessageFlags.IsComponentsV2
		});
	}
}
