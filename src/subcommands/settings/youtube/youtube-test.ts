// youtube-test module within subcommands/settings/youtube
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { ChannelType, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { GuildYouTubeSettingsService } from '../../../services/guildYouTubeSettingsService';
import { YouTubeService } from '../../../services/youtubeService';
import { createComponentDetailsSection, createTextComponent, replyWithComponent, editReplyWithComponent } from '../../../lib/components';
import { getMissingPermissionNames, getMissingPermissionNamesForChannel, mergePermissionNameLists } from './youtube-permissions';

export async function chatInputYouTubeTest(command: Subcommand, interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		return replyWithComponent(interaction, '❌ This command can only be used in a server.', true);
	}

	// // Check permissions
	// if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
	// 	return replyWithComponent(interaction, '❌ You need the "Manage Channels" permission to test YouTube tracking.', true);
	// }

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(interaction.guild.id);

		if (!settings || !settings.enabled || !settings.youtubeChannelUrl || !settings.discordChannelId) {
			return editReplyWithComponent(
				interaction,
				'❌ YouTube tracking is not properly configured. Please use `/settings youtube enable` first.',
				true
			);
		}

		const memberGuildMissingPermissions = getMissingPermissionNames(interaction.memberPermissions ?? null);
		const botMember = interaction.guild.members.me ?? null;
		const botGuildMissingPermissions = getMissingPermissionNames(botMember?.permissions ?? null);

		// Test updating channel name
		const channel = interaction.guild.channels.cache.get(settings.discordChannelId);
		if (!channel) {
			return editReplyWithComponent(
				interaction,
				'❌ The configured Discord channel no longer exists. Please reconfigure YouTube tracking.',
				true
			);
		}

		const memberMissingPermissions = mergePermissionNameLists(
			memberGuildMissingPermissions,
			getMissingPermissionNamesForChannel(channel, interaction.user)
		);

		const botMissingPermissions = mergePermissionNameLists(botGuildMissingPermissions, getMissingPermissionNamesForChannel(channel, botMember));

		if (memberMissingPermissions.length > 0 || botMissingPermissions.length > 0) {
			const issues: string[] = [];

			if (memberMissingPermissions.length > 0) {
				issues.push(`• You are missing: ${memberMissingPermissions.join(', ')}`);
			}

			if (botMissingPermissions.length > 0) {
				issues.push(`• The bot is missing: ${botMissingPermissions.join(', ')}`);
			}

			return editReplyWithComponent(
				interaction,
				`❌ Missing required permissions to test YouTube tracking.\n${issues.join('\n')}\nPlease grant these permissions on the configured channel and try again.`,
				true
			);
		}

		if (channel.type !== ChannelType.GuildVoice) {
			return editReplyWithComponent(
				interaction,
				'❌ The configured Discord channel is not a voice channel. Please reconfigure YouTube tracking.',
				true
			);
		}

		// Use the YouTube service for force update
		const youtubeService = YouTubeService.getInstance();
		const result = await youtubeService.forceUpdate(interaction.guild.id);

		if (!result.success) {
			return editReplyWithComponent(interaction, `❌ Test failed: ${result.message}`, true);
		}

		const newChannelName = YouTubeService.formatChannelName(result.currentCount!.toString());

		return interaction.editReply({
			components: [
				createComponentDetailsSection({
					title: '✅ **YouTube Tracking Test Successful**',
					summary: 'The YouTube tracking configuration is working correctly!',
					details: [
						{ label: 'YouTube Channel', value: settings.youtubeChannelUrl },
						{ label: 'Channel Name', value: settings.channelName || 'Not stored' },
						{ label: 'Discord Channel', value: `<#${settings.discordChannelId}>` },
						{ label: 'Fetched Subscriber Count', value: String(result.currentCount) },
						{ label: 'Channel Name Updated', value: newChannelName }
					],
					thumbnailUrl: settings.channelAvatarUrl || undefined
				})
			],
			flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error testing configuration:', error);
		return editReplyWithComponent(
			interaction,
			'❌ An error occurred while testing the YouTube tracking configuration. Please try again later.',
			true
		);
	}
}

export async function messageYouTubeTest(command: Subcommand, message: Message) {
	if (!message.guild) {
		return message.reply('❌ This command can only be used in a server.');
	}

	const reply = await message.reply({
		components: [createTextComponent('🔄 Testing YouTube tracking configuration...')],
		flags: MessageFlags.IsComponentsV2
	});

	const memberGuildMissingPermissions = getMissingPermissionNames(message.member?.permissions ?? null);
	const botMember = message.guild.members.me ?? null;
	const botGuildMissingPermissions = getMissingPermissionNames(botMember?.permissions ?? null);

	try {
		const settings = await GuildYouTubeSettingsService.getSettings(message.guild.id);

		if (!settings || !settings.enabled || !settings.youtubeChannelUrl || !settings.discordChannelId) {
			return reply.edit({
				components: [createTextComponent('❌ YouTube tracking is not properly configured. Please use `settings youtube enable` first.')],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Test updating channel name
		const channel = message.guild.channels.cache.get(settings.discordChannelId);
		if (!channel) {
			return reply.edit({
				components: [createTextComponent('❌ The configured Discord channel no longer exists. Please reconfigure YouTube tracking.')],
				flags: MessageFlags.IsComponentsV2
			});
		}

		const memberMissingPermissions = mergePermissionNameLists(
			memberGuildMissingPermissions,
			getMissingPermissionNamesForChannel(channel, message.member ?? message.author)
		);

		const botMissingPermissions = mergePermissionNameLists(botGuildMissingPermissions, getMissingPermissionNamesForChannel(channel, botMember));

		if (memberMissingPermissions.length > 0 || botMissingPermissions.length > 0) {
			const issues: string[] = [];

			if (memberMissingPermissions.length > 0) {
				issues.push(`• You are missing: ${memberMissingPermissions.join(', ')}`);
			}

			if (botMissingPermissions.length > 0) {
				issues.push(`• The bot is missing: ${botMissingPermissions.join(', ')}`);
			}

			return reply.edit({
				components: [
					createTextComponent(
						`❌ Missing required permissions to test YouTube tracking.\n${issues.join('\n')}\nPlease grant these permissions on the configured channel and try again.`
					)
				],
				flags: MessageFlags.IsComponentsV2
			});
		}

		if (channel.type !== ChannelType.GuildVoice) {
			return reply.edit({
				components: [createTextComponent('❌ The configured Discord channel is not a voice channel. Please reconfigure YouTube tracking.')],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Use the YouTube service for force update
		const youtubeService = YouTubeService.getInstance();
		const result = await youtubeService.forceUpdate(message.guild.id);

		if (!result.success) {
			const errorMessage = `❌ **Test Failed**

${result.message}`;

			return reply.edit({
				components: [createTextComponent(errorMessage)],
				flags: MessageFlags.IsComponentsV2
			});
		}

		const newChannelName = YouTubeService.formatChannelName(result.currentCount!.toString());

		return reply.edit({
			components: [
				createComponentDetailsSection({
					title: '✅ **YouTube Tracking Test Successful**',
					summary: 'The YouTube tracking configuration is working correctly!',
					details: [
						{ label: 'YouTube Channel', value: settings.youtubeChannelUrl },
						{ label: 'Channel Name', value: settings.channelName || 'Not stored' },
						{ label: 'Discord Channel', value: `<#${settings.discordChannelId}>` },
						{ label: 'Fetched Subscriber Count', value: String(result.currentCount) },
						{ label: 'Channel Name Updated', value: newChannelName }
					],
					thumbnailUrl: settings.channelAvatarUrl || undefined
				})
			],
			flags: MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error testing configuration:', error);
		return reply.edit({
			components: [createTextComponent('❌ An error occurred while testing the YouTube tracking configuration. Please try again later.')],
			flags: MessageFlags.IsComponentsV2
		});
	}
}
