// utils module within subcommands/settings/youtube
import { SlashCommandSubcommandGroupBuilder, ChannelType } from 'discord.js';

export function registerYouTubeSubcommandGroup(builder: SlashCommandSubcommandGroupBuilder) {
	return builder
		.setName('youtube')
		.setDescription('Configure YouTube subscriber count tracking.')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('enable')
				.setDescription('Enable YouTube subscriber count tracking for a channel.')
				.addStringOption((option) =>
					option
						.setName('youtube_url')
						.setDescription('The YouTube channel URL to track (e.g., https://www.youtube.com/@NoTextToSpeech)')
						.setRequired(true)
				)
				.addChannelOption((option) =>
					option
						.setName('discord_channel')
						.setDescription('The Discord text or voice channel to update with subscriber count')
						.addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildText)
						.setRequired(true)
				)
				.addIntegerOption((option) =>
					option
						.setName('interval')
						.setDescription('Update interval in minutes (5-1440, default: 30)')
						.setMinValue(1)
						.setMaxValue(60)
						.setRequired(false)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('disable')
				.setDescription('Disable YouTube subscriber count tracking.')
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('view')
				.setDescription('View current YouTube subscriber count tracking settings.')
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('test')
				.setDescription('Test the current YouTube tracking configuration.')
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('force-update')
				.setDescription('Force an immediate update of the subscriber count.')
		);
}
