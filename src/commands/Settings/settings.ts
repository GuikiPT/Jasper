// settings module within commands/Settings
import { ApplyOptions } from '@sapphire/decorators';
import { Args, BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import type { Message } from 'discord.js';
import {
	prefixSubcommandMapping,
	registerPrefixSubcommandGroup,
	chatInputPrefixSet as handleChatInputPrefixSet,
	chatInputPrefixView as handleChatInputPrefixView,
	messagePrefixSet as handleMessagePrefixSet,
	messagePrefixView as handleMessagePrefixView
} from '../../subcommands/settings/prefix';
import {
	roleSubcommandMapping,
	registerRoleSubcommandGroup,
	chatInputRoleAdd as handleChatInputRoleAdd,
	chatInputRoleList as handleChatInputRoleList,
	chatInputRoleRemove as handleChatInputRoleRemove,
	messageRoleAdd as handleMessageRoleAdd,
	messageRoleList as handleMessageRoleList,
	messageRoleRemove as handleMessageRoleRemove
} from '../../subcommands/settings/roles';
import {
	channelSubcommandMapping,
	registerChannelSubcommandGroup,
	chatInputChannelAdd as handleChatInputChannelAdd,
	chatInputChannelList as handleChatInputChannelList,
	chatInputChannelRemove as handleChatInputChannelRemove,
	messageChannelAdd as handleMessageChannelAdd,
	messageChannelList as handleMessageChannelList,
	messageChannelRemove as handleMessageChannelRemove
} from '../../subcommands/settings/channels';
import {
	slowmodeSubcommandMapping,
	registerSlowmodeSubcommandGroup,
	chatInputSlowmodeView as handleChatInputSlowmodeView,
	chatInputSlowmodeConfigure as handleChatInputSlowmodeConfigure,
	messageSlowmodeView as handleMessageSlowmodeView,
	messageSlowmodeConfigure as handleMessageSlowmodeConfigure
} from '../../subcommands/settings/slowmode';
import {
	topicSubcommandMapping,
	registerTopicSubcommandGroup,
	chatInputTopicAdd as handleChatInputTopicAdd,
	chatInputTopicList as handleChatInputTopicList,
	chatInputTopicRemove as handleChatInputTopicRemove,
	chatInputTopicImport as handleChatInputTopicImport,
	chatInputTopicExport as handleChatInputTopicExport,
	messageTopicAdd as handleMessageTopicAdd,
	messageTopicList as handleMessageTopicList,
	messageTopicRemove as handleMessageTopicRemove,
	messageTopicImport as handleMessageTopicImport,
	messageTopicExport as handleMessageTopicExport
} from '../../subcommands/settings/topics';
import {
	supportSubcommandMapping,
	registerSupportSubcommandGroup,
	chatInputSupportSet as handleChatInputSupportSet,
	chatInputSupportView as handleChatInputSupportView,
	messageSupportSet as handleMessageSupportSet,
	messageSupportView as handleMessageSupportView
} from '../../subcommands/settings/support';
import {
	youtubeSubcommandMapping,
	registerYouTubeSubcommandGroup,
	chatInputYouTubeEnable as handleChatInputYouTubeEnable,
	chatInputYouTubeDisable as handleChatInputYouTubeDisable,
	chatInputYouTubeView as handleChatInputYouTubeView,
	chatInputYouTubeTest as handleChatInputYouTubeTest,
	chatInputYouTubeForceUpdate as handleChatInputYouTubeForceUpdate,
	messageYouTubeEnable as handleMessageYouTubeEnable,
	messageYouTubeDisable as handleMessageYouTubeDisable,
	messageYouTubeView as handleMessageYouTubeView,
	messageYouTubeTest as handleMessageYouTubeTest,
	messageYouTubeForceUpdate as handleMessageYouTubeForceUpdate
} from '../../subcommands/settings/youtube';

// Coordinates the `/settings` umbrella command, delegating to specific handlers per feature area.

@ApplyOptions<Subcommand.Options>({
	name: 'settings',
	description: 'Configure server-specific settings.',
	detailedDescription: {
		summary: 'Administer Jasper\'s guild configuration including prefixes, role buckets, channel allow lists, support forum options, automatic slowmode, and YouTube subscriber count tracking.',
		chatInputUsage: '/settings <group> <action>',
		messageUsage: '{{prefix}}settings <group> <action>',
		notes: [
			'These subcommands are limited to the configured admin or staff buckets unless noted otherwise.',
			'Autocomplete will suggest every group and action combination to speed up navigation.'
		],
		subcommands: [
			{
				group: 'prefixes',
				name: 'set',
				description: 'Set the message-command prefix used in this guild.',
				chatInputUsage: '/settings prefixes set value:<prefix>',
				messageUsage: '{{prefix}}settings prefixes set <prefix>',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Provide a prefix up to 16 characters; setting applies immediately.'
				],
				aliases: ['prefix set']
			},
			{
				group: 'prefixes',
				name: 'view',
				description: 'Display the current message-command prefix.',
				chatInputUsage: '/settings prefixes view',
				messageUsage: '{{prefix}}settings prefixes view',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Returns the custom prefix when configured; otherwise the default prefix.'
				],
				aliases: ['prefix view']
			},
			{
				group: 'roles',
				name: 'add',
				description: 'Add a role to an allow-list bucket.',
				chatInputUsage: '/settings roles add setting:<bucket> role:<role>',
				messageUsage: '{{prefix}}settings roles add <bucket> <role>',
				notes: [
					'Permissions: Allowed Admin Roles, Allowed Tag Admin Roles, or Manage Server permission.',
					'Setting choices (bucket): allowedAdminRoles, allowedFunCommandRoles, allowedStaffRoles, allowedTagAdminRoles, allowedTagRoles, ignoredSnipedRoles, supportRoles.'
				],
				examples: [
					'/settings roles add setting:allowedAdminRoles role:@Leadership',
					'{{prefix}}settings roles add allowedTagRoles @Helper'
				],
				aliases: ['role add']
			},
			{
				group: 'roles',
				name: 'remove',
				description: 'Remove a role from an allow-list bucket.',
				chatInputUsage: '/settings roles remove setting:<bucket> role:<role>',
				messageUsage: '{{prefix}}settings roles remove <bucket> <role>',
				notes: [
					'Permissions: Allowed Admin Roles, Allowed Tag Admin Roles, or Manage Server permission.',
					'Setting choices (bucket): allowedAdminRoles, allowedFunCommandRoles, allowedStaffRoles, allowedTagAdminRoles, allowedTagRoles, ignoredSnipedRoles, supportRoles.'
				],
				examples: [
					'/settings roles remove setting:ignoredSnipedRoles role:@Muted',
					'{{prefix}}settings roles remove allowedTagRoles @Support'
				],
				aliases: ['role remove']
			},
			{
				group: 'roles',
				name: 'list',
				description: 'List the roles configured for one or all buckets.',
				chatInputUsage: '/settings roles list [setting]',
				messageUsage: '{{prefix}}settings roles list [bucket]',
				notes: [
					'Permissions: Allowed Admin Roles, Allowed Tag Admin Roles, or Manage Server permission.',
					'Use `setting` choices allowedAdminRoles, allowedFunCommandRoles, allowedStaffRoles, allowedTagAdminRoles, allowedTagRoles, ignoredSnipedRoles, supportRoles or omit to list every bucket.'
				],
				examples: [
					'/settings roles list setting:allowedStaffRoles',
					'{{prefix}}settings roles list'
				],
				aliases: ['role list']
			},
			{
				group: 'channels',
				name: 'add',
				description: 'Add a channel to an allow-list such as snipe or tag channels.',
				chatInputUsage: '/settings channels add setting:<bucket> channel:<channel>',
				messageUsage: '{{prefix}}settings channels add <bucket> <channel>',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Bucket keys: allowedSkullboardChannels, allowedSnipeChannels, allowedTagChannels, automaticSlowmodeChannels.'
				],
				aliases: ['channel add']
			},
			{
				group: 'channels',
				name: 'remove',
				description: 'Remove a channel from an allow-list bucket.',
				chatInputUsage: '/settings channels remove setting:<bucket> channel:<channel>',
				messageUsage: '{{prefix}}settings channels remove <bucket> <channel>',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Bucket keys: allowedSkullboardChannels, allowedSnipeChannels, allowedTagChannels, automaticSlowmodeChannels.'
				],
				aliases: ['channel remove']
			},
			{
				group: 'channels',
				name: 'list',
				description: 'List channels configured for one bucket or every bucket.',
				chatInputUsage: '/settings channels list [setting]',
				messageUsage: '{{prefix}}settings channels list [bucket]',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Use bucket keys (allowedSkullboardChannels, allowedSnipeChannels, allowedTagChannels, automaticSlowmodeChannels) or omit to view every bucket.'
				],
				aliases: ['channel list']
			},
			{
				group: 'topics',
				name: 'add',
				description: 'Add a moderation discussion topic to the rotation.',
				chatInputUsage: '/settings topics add value:<topic>',
				messageUsage: '{{prefix}}settings topics add <topic>',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Topic text must be under 256 characters; duplicates are ignored.'
				],
				aliases: ['topic add']
			},
			{
				group: 'topics',
				name: 'list',
				description: 'List all configured discussion topics with their identifiers.',
				chatInputUsage: '/settings topics list',
				messageUsage: '{{prefix}}settings topics list',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Outputs topic IDs you can pass to `/settings topics remove` or `/settings topics export`.'
				],
				aliases: ['topic list']
			},
			{
				group: 'topics',
				name: 'remove',
				description: 'Remove a topic using the identifier from the list command.',
				chatInputUsage: '/settings topics remove id:<number>',
				messageUsage: '{{prefix}}settings topics remove <id>',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Use the numeric ID from `/settings topics list`; deleting an ID shifts later IDs.'
				],
				aliases: ['topic remove']
			},
			{
				group: 'topics',
				name: 'import',
				description: 'Import topics from JSON text or an uploaded file.',
				chatInputUsage: '/settings topics import [file] [text]',
				messageUsage: '{{prefix}}settings topics import [file] [text]',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Accepts a JSON array of up to 500 strings; entries longer than 256 characters are skipped.'
				],
				aliases: ['topic import']
			},
			{
				group: 'topics',
				name: 'export',
				description: 'Export the configured topics as a JSON attachment.',
				chatInputUsage: '/settings topics export',
				messageUsage: '{{prefix}}settings topics export',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Generates a JSON file you can back up or feed back into `/settings topics import`.'
				],
				aliases: ['topic export']
			},
			{
				group: 'support',
				name: 'set',
				description: 'Update support forum settings such as the forum channel or resolved tag.',
				chatInputUsage: '/settings support set setting:<key> [value]',
				messageUsage: '{{prefix}}settings support set <setting> [value]',
				notes: [
					'Permissions: allowed admin roles, allowed tag admin roles, or Manage Server permission.',
					'Setting keys: supportForumChannelId (expects a forum channel ID) and resolvedTagId (expects a forum tag ID).',
					'Passing an empty value removes the setting.'
				],
				aliases: ['support set']
			},
			{
				group: 'support',
				name: 'view',
				description: 'Display the current support forum configuration.',
				chatInputUsage: '/settings support view',
				messageUsage: '{{prefix}}settings support view',
				notes: [
					'Permissions: Allowed Admin Roles, Allowed Tag Admin Roles, or Manage Server permission.',
					'Shows the configured supportForumChannelId and resolvedTagId values if present.'
				],
				aliases: ['support view']
			},
			{
				group: 'slowmode',
				name: 'view',
				description: 'Inspect automatic slowmode status and tracked channels.',
				chatInputUsage: '/settings slowmode view',
				messageUsage: '{{prefix}}settings slowmode view',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Displays thresholds, timers, and channels using automatic slowmode.'
				],
				aliases: ['slowmode view']
			},
			{
				group: 'slowmode',
				name: 'configure',
				description: 'Update thresholds and timing for automatic slowmode.',
				chatInputUsage: '/settings slowmode configure [enabled] [threshold] [window] [cooldown] [reset] [max]',
				messageUsage: '{{prefix}}settings slowmode configure [fields...]',
				notes: [
					'Permissions: Administrator permission or members in Allowed Admin Roles.',
					'Parameters map to Slowmode Manager settings: enabled (boolean), threshold/message count, window/activity seconds, cooldown/adjustment seconds, reset/inactivity seconds, max/max slowmode seconds.'
				],
				aliases: ['slowmode config']
			},
			{
				group: 'youtube',
				name: 'enable',
				description: 'Enable YouTube subscriber count tracking for a voice channel.',
				chatInputUsage: '/settings youtube enable youtube_url:<url> discord_channel:<channel> [interval:<minutes>]',
				messageUsage: '{{prefix}}settings youtube enable <youtube_url> <discord_channel> [interval_minutes]',
				notes: [
					'Permissions: Manage Channels permission.',
					'The bot needs Manage Channels permission to update channel names.',
					'Interval must be between 5 and 1440 minutes (default: 30).'
				],
				examples: [
					'/settings youtube enable youtube_url:https://www.youtube.com/@MrBeast discord_channel:#sub-count interval:15',
					'{{prefix}}settings youtube enable https://www.youtube.com/@MrBeast #sub-count 30'
				],
				aliases: ['youtube enable']
			},
			{
				group: 'youtube',
				name: 'disable',
				description: 'Disable YouTube subscriber count tracking.',
				chatInputUsage: '/settings youtube disable',
				messageUsage: '{{prefix}}settings youtube disable',
				notes: [
					'Permissions: Manage Channels permission.',
					'This will stop automatic updates but won\'t change the current channel name.'
				],
				aliases: ['youtube disable']
			},
			{
				group: 'youtube',
				name: 'view',
				description: 'View current YouTube subscriber count tracking configuration.',
				chatInputUsage: '/settings youtube view',
				messageUsage: '{{prefix}}settings youtube view',
				notes: [
					'Permissions: Manage Channels permission.',
					'Shows current settings including last known subscriber count.'
				],
				aliases: ['youtube view']
			},
			{
				group: 'youtube',
				name: 'test',
				description: 'Test the YouTube tracking configuration and update immediately.',
				chatInputUsage: '/settings youtube test',
				messageUsage: '{{prefix}}settings youtube test',
				notes: [
					'Permissions: Manage Channels permission.',
					'Forces an immediate update of the subscriber count and channel name.'
				],
				aliases: ['youtube test']
			}
		]
	},
	fullCategory: ['Settings'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	requiredClientPermissions: ['SendMessages'],
	subcommands: [
		prefixSubcommandMapping,
		roleSubcommandMapping,
		channelSubcommandMapping,
		topicSubcommandMapping,
		supportSubcommandMapping,
		slowmodeSubcommandMapping,
		youtubeSubcommandMapping
	]
})
export class SettingsCommand extends Subcommand {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];

	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addSubcommandGroup(registerPrefixSubcommandGroup)
				.addSubcommandGroup(registerRoleSubcommandGroup)
				.addSubcommandGroup(registerChannelSubcommandGroup)
				.addSubcommandGroup(registerTopicSubcommandGroup)
				.addSubcommandGroup(registerSupportSubcommandGroup)
				.addSubcommandGroup(registerSlowmodeSubcommandGroup)
				.addSubcommandGroup(registerYouTubeSubcommandGroup)
		);
	}

	public async messagePrefixSet(message: Message, args: Args) {
		return handleMessagePrefixSet(this, message, args);
	}

	public async messagePrefixView(message: Message, args: Args) {
		return handleMessagePrefixView(this, message, args);
	}

	public async chatInputPrefixSet(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputPrefixSet(this, interaction);
	}

	public async chatInputPrefixView(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputPrefixView(this, interaction);
	}

	public async messageRoleAdd(message: Message, args: Args) {
		return handleMessageRoleAdd(this, message, args);
	}

	public async messageRoleRemove(message: Message, args: Args) {
		return handleMessageRoleRemove(this, message, args);
	}

	public async messageRoleList(message: Message, args: Args) {
		return handleMessageRoleList(this, message, args);
	}

	public async chatInputRoleAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputRoleAdd(this, interaction);
	}

	public async chatInputRoleRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputRoleRemove(this, interaction);
	}

	public async chatInputRoleList(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputRoleList(this, interaction);
	}

	public async messageChannelAdd(message: Message, args: Args) {
		return handleMessageChannelAdd(this, message, args);
	}

	public async messageChannelRemove(message: Message, args: Args) {
		return handleMessageChannelRemove(this, message, args);
	}

	public async messageChannelList(message: Message, args: Args) {
		return handleMessageChannelList(this, message, args);
	}

	public async chatInputChannelAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputChannelAdd(this, interaction);
	}

	public async chatInputChannelRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputChannelRemove(this, interaction);
	}

	public async chatInputChannelList(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputChannelList(this, interaction);
	}

	public async messageSlowmodeView(message: Message) {
		return handleMessageSlowmodeView(this, message);
	}

	public async messageSlowmodeConfigure(message: Message, args: Args) {
		return handleMessageSlowmodeConfigure(this, message, args);
	}

	public async chatInputSlowmodeView(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputSlowmodeView(this, interaction);
	}

	public async chatInputSlowmodeConfigure(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputSlowmodeConfigure(this, interaction);
	}

	public async messageTopicAdd(message: Message, args: Args) {
		return handleMessageTopicAdd(this, message, args);
	}

	public async messageTopicRemove(message: Message, args: Args) {
		return handleMessageTopicRemove(this, message, args);
	}

	public async messageTopicList(message: Message, args: Args) {
		return handleMessageTopicList(this, message, args);
	}

	public async chatInputTopicAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicAdd(this, interaction);
	}

	public async chatInputTopicRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicRemove(this, interaction);
	}

	public async chatInputTopicList(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicList(this, interaction);
	}

	public async messageTopicImport(message: Message, args: Args) {
		return handleMessageTopicImport(this, message, args);
	}

	public async messageTopicExport(message: Message, args: Args) {
		return handleMessageTopicExport(this, message, args);
	}

	public async chatInputTopicImport(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicImport(this, interaction);
	}

	public async chatInputTopicExport(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicExport(this, interaction);
	}

	public async messageSupportSet(message: Message, args: Args) {
		return handleMessageSupportSet(this, message, args);
	}

	public async messageSupportView(message: Message, args: Args) {
		return handleMessageSupportView(this, message, args);
	}

	public async chatInputSupportSet(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputSupportSet(this, interaction);
	}

	public async chatInputSupportView(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputSupportView(this, interaction);
	}

	// YouTube subcommand handlers
	public async messageYouTubeEnable(message: Message, args: Args) {
		return handleMessageYouTubeEnable(this, message, args);
	}

	public async messageYouTubeDisable(message: Message) {
		return handleMessageYouTubeDisable(this, message);
	}

	public async messageYouTubeView(message: Message) {
		return handleMessageYouTubeView(this, message);
	}

	public async messageYouTubeTest(message: Message) {
		return handleMessageYouTubeTest(this, message);
	}

	public async chatInputYouTubeEnable(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputYouTubeEnable(this, interaction);
	}

	public async chatInputYouTubeDisable(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputYouTubeDisable(this, interaction);
	}

	public async chatInputYouTubeView(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputYouTubeView(this, interaction);
	}

	public async chatInputYouTubeTest(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputYouTubeTest(this, interaction);
	}

	public async chatInputYouTubeForceUpdate(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputYouTubeForceUpdate(this, interaction);
	}

	public async messageYouTubeForceUpdate(message: Message, args: Args) {
		return handleMessageYouTubeForceUpdate(this, message, args);
	}
}
