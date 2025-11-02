// youtube-enable module within subcommands/settings/youtube
import type { Args } from '@sapphire/framework';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { ChannelType, MessageFlags, TextDisplayBuilder, SectionBuilder, ContainerBuilder, ThumbnailBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { GuildYouTubeSettingsService } from '../../../services/guildYouTubeSettingsService';
import { YouTubeService } from '../../../services/youtubeService';
import { createTextComponent, replyWithComponent, editReplyWithComponent } from '../../../lib/components';
import { getMissingPermissionNames, getMissingPermissionNamesForChannel, mergePermissionNameLists } from './youtube-permissions';

export async function chatInputYouTubeEnable(command: Subcommand, interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		return replyWithComponent(interaction, '❌ This command can only be used in a server.', true);
	}

	const youtubeUrl = interaction.options.getString('youtube_url', true);
	const discordChannel = interaction.options.getChannel('discord_channel', true);
	const interval = interaction.options.getInteger('interval') || 30;

	// Validate interval
	if (!GuildYouTubeSettingsService.isValidInterval(interval)) {
		return replyWithComponent(interaction, '❌ Invalid interval. Please provide a value between 5 and 1440 minutes.', true);
	}

	// Validate YouTube URL
	if (!YouTubeService.isValidYouTubeChannelUrl(youtubeUrl)) {
		return replyWithComponent(
			interaction,
			'❌ Invalid YouTube channel URL. Please provide a valid YouTube channel URL (e.g., https://www.youtube.com/@NoTextToSpeech)',
			true
		);
	}

	// Validate Discord channel
	const allowedChannelTypes = [ChannelType.GuildVoice, ChannelType.GuildText];
	if (!allowedChannelTypes.includes(discordChannel.type)) {
		return replyWithComponent(interaction, '❌ Please select a text or voice channel for the subscriber count display.', true);
	}

	const guildChannel = interaction.guild.channels.cache.get(discordChannel.id) ?? null;

	if (!guildChannel) {
		return replyWithComponent(
			interaction,
			'❌ Unable to access the selected channel. Please ensure the bot has the necessary permissions.',
			true
		);
	}

	const memberMissingPermissions = mergePermissionNameLists(
		getMissingPermissionNames(interaction.memberPermissions ?? null),
		getMissingPermissionNamesForChannel(guildChannel, interaction.user)
	);

	const botMember = interaction.guild.members.me ?? null;
	const botMissingPermissions = mergePermissionNameLists(
		getMissingPermissionNames(botMember?.permissions ?? null),
		getMissingPermissionNamesForChannel(guildChannel, botMember)
	);

	if (memberMissingPermissions.length > 0 || botMissingPermissions.length > 0) {
		const issues: string[] = [];

		if (memberMissingPermissions.length > 0) {
			issues.push(`• You are missing: ${memberMissingPermissions.join(', ')}`);
		}

		if (botMissingPermissions.length > 0) {
			issues.push(`• The bot is missing: ${botMissingPermissions.join(', ')}`);
		}

		return replyWithComponent(
			interaction,
			`❌ Missing required permissions to configure YouTube tracking:\n${issues.join('\n')}\nPlease grant these permissions on the selected channel and try again.`,
			true
		);
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		// Fetch channel metadata to validate accessibility and grab initial details
		const metadata = await YouTubeService.fetchChannelMetadata(youtubeUrl);
		if (!metadata || !metadata.subscriberCount) {
			return editReplyWithComponent(
				interaction,
				'❌ Unable to fetch subscriber count from the provided YouTube channel. Please check the URL and try again.',
				true
			);
		}

		// Save settings
		await GuildYouTubeSettingsService.enableTracking(interaction.guild.id, youtubeUrl, discordChannel.id, interval, {
			channelName: metadata.channelName ?? null,
			channelAvatarUrl: metadata.channelAvatarUrl ?? null
		});

		// Update channel name immediately
		const newChannelName = YouTubeService.formatChannelName(metadata.subscriberCount);

		if ('setName' in guildChannel && typeof guildChannel.setName === 'function') {
			await guildChannel.setName(newChannelName);
		} else if ('edit' in guildChannel && typeof (guildChannel as any).edit === 'function') {
			await (guildChannel as any).edit({ name: newChannelName });
		} else {
			return editReplyWithComponent(
				interaction,
				'❌ Unable to rename the selected channel. Please ensure the bot has the necessary permissions.',
				true
			);
		}

		// Tracking will be handled automatically by the service

		return interaction.editReply({
			components: [
				buildEnableSuccessComponent({
					metadata,
					youtubeUrl,
					discordChannelId: discordChannel.id,
					interval
				})
			],
			flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error enabling tracking:', error);
		return editReplyWithComponent(interaction, '❌ An error occurred while setting up YouTube tracking. Please try again later.', true);
	}
}

export async function messageYouTubeEnable(command: Subcommand, message: Message, args: Args) {
	if (!message.guild) {
		return message.reply('❌ This command can only be used in a server.');
	}

	const youtubeUrl = await args.pick('string').catch(() => null);
	const discordChannel = await args.pick('guildChannel').catch(() => null);
	const interval = await args.pick('integer').catch(() => 30);

	if (!youtubeUrl || !discordChannel) {
		return message.reply('❌ Usage: `settings youtube enable <youtube_url> <discord_channel> [interval_minutes]`');
	}

	// Validate YouTube URL
	if (!YouTubeService.isValidYouTubeChannelUrl(youtubeUrl)) {
		return message.reply(
			'❌ Invalid YouTube channel URL. Please provide a valid YouTube channel URL (e.g., https://www.youtube.com/@NoTextToSpeech)'
		);
	}

	const allowedChannelTypes = [ChannelType.GuildVoice, ChannelType.GuildText];
	if (!allowedChannelTypes.includes(discordChannel.type)) {
		return message.reply('❌ Please select a text or voice channel for the subscriber count display.');
	}

	const guildChannel = message.guild.channels.cache.get(discordChannel.id) ?? null;

	if (!guildChannel) {
		return message.reply('❌ Unable to access the selected channel. Please ensure the bot has the necessary permissions.');
	}

	const memberMissingPermissions = mergePermissionNameLists(
		getMissingPermissionNames(message.member?.permissions ?? null),
		getMissingPermissionNamesForChannel(guildChannel, message.member ?? message.author)
	);

	const botMember = message.guild.members.me ?? null;
	const botMissingPermissions = mergePermissionNameLists(
		getMissingPermissionNames(botMember?.permissions ?? null),
		getMissingPermissionNamesForChannel(guildChannel, botMember)
	);

	if (memberMissingPermissions.length > 0 || botMissingPermissions.length > 0) {
		const issues: string[] = [];

		if (memberMissingPermissions.length > 0) {
			issues.push(`• You are missing: ${memberMissingPermissions.join(', ')}`);
		}

		if (botMissingPermissions.length > 0) {
			issues.push(`• The bot is missing: ${botMissingPermissions.join(', ')}`);
		}

		return message.reply(
			`❌ Missing required permissions to configure YouTube tracking.\n${issues.join('\n')}\nPlease grant these permissions on the selected channel and try again.`
		);
	}

	const reply = await message.reply({
		components: [createTextComponent('🔄 Setting up YouTube tracking...')],
		flags: MessageFlags.IsComponentsV2
	});

	try {
		// Fetch channel metadata to validate accessibility and grab initial details
		const metadata = await YouTubeService.fetchChannelMetadata(youtubeUrl);
		if (!metadata || !metadata.subscriberCount) {
			return reply.edit({
				components: [
					createTextComponent('❌ Unable to fetch subscriber count from the provided YouTube channel. Please check the URL and try again.')
				],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Save settings
		await GuildYouTubeSettingsService.enableTracking(message.guild.id, youtubeUrl, discordChannel.id, interval, {
			channelName: metadata.channelName ?? null,
			channelAvatarUrl: metadata.channelAvatarUrl ?? null
		});

		// Update channel name immediately
		const newChannelName = YouTubeService.formatChannelName(metadata.subscriberCount);
		if ('setName' in guildChannel && typeof guildChannel.setName === 'function') {
			await guildChannel.setName(newChannelName);
		} else if ('edit' in guildChannel && typeof (guildChannel as any).edit === 'function') {
			await (guildChannel as any).edit({ name: newChannelName });
		} else {
			return reply.edit({
				components: [createTextComponent('❌ Unable to access the selected channel. Please ensure the bot has the necessary permissions.')],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Tracking will be handled automatically by the service

		return reply.edit({
			components: [
				buildEnableSuccessComponent({
					metadata,
					youtubeUrl,
					discordChannelId: discordChannel.id,
					interval
				})
			],
			flags: MessageFlags.IsComponentsV2
		});
	} catch (error) {
		command.container.logger.error('[YouTube Settings] Error enabling tracking:', error);
		return reply.edit({
			components: [createTextComponent('❌ An error occurred while setting up YouTube tracking. Please try again later.')],
			flags: MessageFlags.IsComponentsV2
		});
	}
}

function buildEnableSuccessComponent(params: {
	metadata: Awaited<ReturnType<typeof YouTubeService.fetchChannelMetadata>>;
	youtubeUrl: string;
	discordChannelId: string;
	interval: number;
}) {
	const { metadata, youtubeUrl, discordChannelId, interval } = params;
	const actualMetadata = metadata ?? { subscriberCount: 'Unknown', channelName: null, channelAvatarUrl: null };

	const section = new SectionBuilder().addTextDisplayComponents(
		new TextDisplayBuilder().setContent('✅ **YouTube Tracking Enabled**'),
		new TextDisplayBuilder().setContent('YouTube subscriber count tracking has been successfully configured!')
	);

	const detailLines = [
		`• **Channel Name:** ${actualMetadata.channelName ?? 'Unavailable'}`,
		`• **YouTube Channel:** ${youtubeUrl}`,
		`• **Discord Channel:** <#${discordChannelId}>`,
		`• **Update Interval:** ${interval} minutes`,
		`• **Current Subscriber Count:** ${actualMetadata.subscriberCount ?? 'Unknown'}`
	];

	section.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')));

	if (actualMetadata.channelAvatarUrl) {
		section.setThumbnailAccessory(new ThumbnailBuilder().setURL(actualMetadata.channelAvatarUrl));
	}

	return new ContainerBuilder().addSectionComponents(section);
}
