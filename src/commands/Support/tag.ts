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
} from '../../subcommands/support/tag';

@ApplyOptions<Subcommand.Options>({
	name: 'tag',
	description: 'Manage reusable support tags.',
	fullCategory: ['Support'],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['supportRoles', 'allowedStaffRoles'] as const,
				allowManageGuild: false,
				errorMessage: 'Support commands may only be used by users with "Support Roles" or "Staff Roles".'
			}
		}
	],
	requiredClientPermissions: ['SendMessages'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subcommands: [
		{ name: 'create', chatInputRun: 'chatInputTagCreate', preconditions: ['AllowedTagRoles'] },
		{ name: 'delete', chatInputRun: 'chatInputTagDelete', preconditions: ['AllowedTagRoles'] },
		{ name: 'edit', chatInputRun: 'chatInputTagEdit', preconditions: ['AllowedTagRoles'] },
		{ name: 'export', chatInputRun: 'chatInputTagExport', preconditions: ['AllowedTagAdminRoles'] },
		{ name: 'import', chatInputRun: 'chatInputTagImport', preconditions: ['AllowedTagAdminRoles'] },
		{
			name: 'info',
			chatInputRun: 'chatInputTagInfo',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedTagRoles', 'allowedStaffRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role or allowed staff role to view tag information.'
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
						buckets: ['allowedTagRoles', 'allowedStaffRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role or allowed staff role to list tags.'
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
						buckets: ['allowedTagRoles', 'allowedStaffRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role or allowed staff role to show tags.'
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
						buckets: ['allowedTagRoles', 'allowedStaffRoles'] as const,
						allowManageGuild: false,
						errorMessage: 'You need an allowed tag role or allowed staff role to use tags.'
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
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option
								.setName('ephemeral')
								.setDescription('Send the tag privately.')
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
