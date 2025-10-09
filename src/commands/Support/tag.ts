// tag module within commands/Support
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	type SlashCommandBooleanOption,
	type SlashCommandBuilder,
	type SlashCommandStringOption,
	type SlashCommandSubcommandBuilder,
	type SlashCommandUserOption
} from 'discord.js';
import {
	chatInputTagCreate,
	chatInputTagDelete,
	chatInputTagEdit,
	chatInputTagExport,
	chatInputTagImport,
	chatInputTagInfo,
	chatInputTagList,
	chatInputTagRaw,
	chatInputTagShow,
	chatInputTagUse,
	type TagChatInputInteraction
} from '../../subcommands/support/tag/tag-index';

// Aggregates the entire `/tag` feature set into a single subcommand-driven command.

@ApplyOptions<Subcommand.Options>({
	name: 'tag',
	description: 'Manage reusable support tags.',
	detailedDescription: {
		summary: 'Create, edit, and drop reusable support tags so staff can respond to questions consistently.',
		chatInputUsage: '/tag <subcommand>',
		notes: [
			'Most actions require an allowed tag role in addition to support, staff, or admin permissions.',
			'Use `/tag list` to review available tags and `/tag use` to send one into the current channel.'
		],
		subcommands: [
			{
				name: 'create',
				description: 'Open an interactive modal to capture a new support tag embed.',
				chatInputUsage: '/tag create',
				notes: ['Requires an allowed tag role, staff role, or admin role.'],
				aliases: ['new tag']
			},
			{
				name: 'delete',
				description: 'Remove an existing tag by name.',
				chatInputUsage: '/tag delete name:<tag>',
				notes: ['Requires an allowed tag admin role or the configured admin buckets.'],
				aliases: ['remove tag']
			},
			{
				name: 'edit',
				description: 'Update the embed details for an existing tag.',
				chatInputUsage: '/tag edit name:<tag>',
				notes: ['Requires an allowed tag role, staff role, or admin role.']
			},
			{
				name: 'export',
				description: 'Export every tag in the guild as a JSON attachment.',
				chatInputUsage: '/tag export',
				notes: ['Restricted to allowed tag admin roles.']
			},
			{
				name: 'import',
				description: 'Import tags from provided JSON text or an uploaded file.',
				chatInputUsage: '/tag import [payload|file] [overwrite]',
				notes: ['Restricted to allowed tag admin roles.']
			},
			{
				name: 'info',
				description: 'Show metadata, authorship, and usage stats for a tag.',
				chatInputUsage: '/tag info name:<tag>',
				notes: ['Requires an allowed tag role, staff role, or admin role.']
			},
			{
				name: 'list',
				description: 'List tags that you are allowed to use, grouped by channel restrictions.',
				chatInputUsage: '/tag list',
				notes: ['Requires an allowed tag role, staff role, or admin role.']
			},
			{
				name: 'raw',
				description: 'Display the raw embed payload for a tag for debugging.',
				chatInputUsage: '/tag raw name:<tag>',
				notes: ['Restricted to allowed tag admin roles.']
			},
			{
				name: 'show',
				description: 'Preview how a tag embed will render, optionally only to yourself.',
				chatInputUsage: '/tag show name:<tag> [ephemeral]',
				notes: ['Requires an allowed tag role, staff role, or admin role.'],
				aliases: ['preview tag']
			},
			{
				name: 'use',
				description: 'Send a tag into the current channel, optionally mentioning a user.',
				chatInputUsage: '/tag use name:<tag> [user]',
				notes: ['Requires an allowed tag role, staff role, or admin role.'],
				aliases: ['send tag']
			}
		]
	},
	fullCategory: ['Support'],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['supportRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
				allowManageGuild: false,
				errorMessage: 'Support commands may only be used by users with "Support Roles", "Staff Roles", or "Admin Roles".'
			}
		}
	],
	requiredClientPermissions: ['SendMessages'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subcommands: [
		{
			name: 'create',
			chatInputRun: 'chatInputTagCreate',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role, staff role, or admin role to create tags.'
					}
				}
			]
		},
		{
			name: 'delete',
			chatInputRun: 'chatInputTagDelete',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role, staff role, or admin role to delete tags.'
					}
				}
			]
		},
		{
			name: 'edit',
			chatInputRun: 'chatInputTagEdit',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role, staff role, or admin role to edit tags.'
					}
				}
			]
		},
		{ name: 'export', chatInputRun: 'chatInputTagExport', preconditions: ['AllowedTagAdminRoles'] },
		{ name: 'import', chatInputRun: 'chatInputTagImport', preconditions: ['AllowedTagAdminRoles'] },
		{
			name: 'info',
			chatInputRun: 'chatInputTagInfo',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role, staff role, or admin role to view tag information.'
					}
				}
			]
		},
		{
			name: 'list',
			chatInputRun: 'chatInputTagList',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role, staff role, or admin role to list tags.'
					}
				}
			]
		},
		{ name: 'raw', chatInputRun: 'chatInputTagRaw', preconditions: ['AllowedTagAdminRoles'] },
		{
			name: 'show',
			chatInputRun: 'chatInputTagShow',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role, staff role, or admin role to show tags.'
					}
				}
			]
		},
		{
			name: 'use',
			chatInputRun: 'chatInputTagUse',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role, staff role, or admin role to use tags.'
					}
				}
			]
		}
	]
})
export class SupportTagCommand extends Subcommand {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];

	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub.setName('create').setDescription('Create a new support tag.'))
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('delete')
						.setDescription('Delete an existing tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to delete.')
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('edit')
						.setDescription('Update an existing tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to edit.')
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub.setName('export').setDescription('Export all tags to a JSON file.'))
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('import')
						.setDescription('Import tags from JSON data.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('payload')
								.setDescription('JSON array payload describing the tags to import.')
								.setRequired(false)
						)
						.addAttachmentOption((option) =>
							option
								.setName('file')
								.setDescription('JSON file containing tags to import.')
								.setRequired(false)
						)
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option
								.setName('overwrite')
								.setDescription('Replace existing tags instead of merging.')
								.setRequired(false)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('info')
						.setDescription('Show metadata about a tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag.')
								.setRequired(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('list')
						.setDescription('List available support tags.')
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('raw')
						.setDescription('Show the raw embed payload for a tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to inspect.')
								.setRequired(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('show')
						.setDescription('Preview a tag embed.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to preview.')
								.setRequired(true)
						)
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option
								.setName('ephemeral')
								.setDescription('Show the preview only to you.')
								.setRequired(false)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('use')
						.setDescription('Send a tag to the current channel.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to send.')
								.setRequired(true)
								.setAutocomplete(true)
						)
						.addUserOption((option: SlashCommandUserOption) =>
							option
								.setName('user')
								.setDescription('Mention a user alongside the tag.')
								.setRequired(false)
						)
				)
		);
	}

	public async chatInputTagCreate(interaction: TagChatInputInteraction) {
		return chatInputTagCreate(this, interaction);
	}

	public async chatInputTagDelete(interaction: TagChatInputInteraction) {
		return chatInputTagDelete(this, interaction);
	}

	public async chatInputTagEdit(interaction: TagChatInputInteraction) {
		return chatInputTagEdit(this, interaction);
	}

	public async chatInputTagExport(interaction: TagChatInputInteraction) {
		return chatInputTagExport(this, interaction);
	}

	public async chatInputTagImport(interaction: TagChatInputInteraction) {
		return chatInputTagImport(this, interaction);
	}

	public async chatInputTagInfo(interaction: TagChatInputInteraction) {
		return chatInputTagInfo(this, interaction);
	}

	public async chatInputTagList(interaction: TagChatInputInteraction) {
		return chatInputTagList(this, interaction);
	}

	public async chatInputTagRaw(interaction: TagChatInputInteraction) {
		return chatInputTagRaw(this, interaction);
	}

	public async chatInputTagShow(interaction: TagChatInputInteraction) {
		return chatInputTagShow(this, interaction);
	}

	public async chatInputTagUse(interaction: TagChatInputInteraction) {
		return chatInputTagUse(this, interaction);
	}
}
