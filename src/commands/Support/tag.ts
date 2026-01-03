// Tag command - reusable support message system with embeds
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

	// Register all tag subcommands with Discord
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				// Create: Opens modal for new tag
				.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('create').setDescription('Create a new support tag.'))
				// Delete: Remove tag by name
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('delete')
						.setDescription('Delete an existing tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('name').setDescription('Name of the tag to delete.').setRequired(true).setAutocomplete(true)
						)
				)
				// Edit: Update existing tag via modal
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('edit')
						.setDescription('Update an existing tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('name').setDescription('Name of the tag to edit.').setRequired(true).setAutocomplete(true)
						)
				)
				// Export: Download all tags as JSON
				.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('export').setDescription('Export all tags to a JSON file.'))
				// Import: Upload tags from JSON
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('import')
						.setDescription('Import tags from JSON data.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('payload').setDescription('JSON array payload describing the tags to import.').setRequired(false)
						)
						.addAttachmentOption((option) =>
							option.setName('file').setDescription('JSON file containing tags to import.').setRequired(false)
						)
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option.setName('overwrite').setDescription('Replace existing tags instead of merging.').setRequired(false)
						)
				)
				// Info: Show tag metadata and stats
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('info')
						.setDescription('Show metadata about a tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('name').setDescription('Name of the tag.').setRequired(true)
						)
				)
				// List: Show all available tags
				.addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('list').setDescription('List available support tags.'))
				// Raw: Display raw JSON payload
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('raw')
						.setDescription('Show the raw embed payload for a tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('name').setDescription('Name of the tag to inspect.').setRequired(true)
						)
				)
				// Show: Preview tag embed
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('show')
						.setDescription('Preview a tag embed.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('name').setDescription('Name of the tag to preview.').setRequired(true)
						)
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option.setName('ephemeral').setDescription('Show the preview only to you.').setRequired(false)
						)
				)
				// Use: Send tag to channel
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('use')
						.setDescription('Send a tag to the current channel.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('name').setDescription('Name of the tag to send.').setRequired(true).setAutocomplete(true)
						)
						.addUserOption((option: SlashCommandUserOption) =>
							option.setName('user').setDescription('Mention a user alongside the tag.').setRequired(false)
						)
				)
		);
	}

	// ============================================================
	// Tag Subcommand Handlers
	// ============================================================

	public async chatInputTagCreate(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagCreate(this, interaction);
			this.logSuccess(interaction, 'tag create');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag create', error);
		}
	}

	public async chatInputTagDelete(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagDelete(this, interaction);
			this.logSuccess(interaction, 'tag delete');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag delete', error);
		}
	}

	public async chatInputTagEdit(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagEdit(this, interaction);
			this.logSuccess(interaction, 'tag edit');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag edit', error);
		}
	}

	public async chatInputTagExport(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagExport(this, interaction);
			this.logSuccess(interaction, 'tag export');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag export', error);
		}
	}

	public async chatInputTagImport(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagImport(this, interaction);
			this.logSuccess(interaction, 'tag import');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag import', error);
		}
	}

	public async chatInputTagInfo(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagInfo(this, interaction);
			this.logSuccess(interaction, 'tag info');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag info', error);
		}
	}

	public async chatInputTagList(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagList(this, interaction);
			this.logSuccess(interaction, 'tag list');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag list', error);
		}
	}

	public async chatInputTagRaw(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagRaw(this, interaction);
			this.logSuccess(interaction, 'tag raw');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag raw', error);
		}
	}

	public async chatInputTagShow(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagShow(this, interaction);
			this.logSuccess(interaction, 'tag show');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag show', error);
		}
	}

	public async chatInputTagUse(interaction: TagChatInputInteraction) {
		try {
			const result = await chatInputTagUse(this, interaction);
			this.logSuccess(interaction, 'tag use');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'tag use', error);
		}
	}

	private async handleInteractionError(interaction: TagChatInputInteraction, stage: string, error: unknown) {
		const subcommand = interaction.options.getSubcommand(false);
		this.container.logger.error('[Tag] Command failed', error, {
			stage,
			subcommand: subcommand ?? 'none',
			guildId: interaction.guildId ?? 'dm',
			userId: interaction.user.id,
			interactionId: interaction.id
		});

		const payload = {
			content: 'I hit an error while processing that tag command. Please try again.',
			ephemeral: true
		};

		if (interaction.replied || interaction.deferred) {
			return interaction.editReply({ content: payload.content }).catch((replyError) => {
				this.container.logger.error('[Tag] Failed to edit reply after error', replyError, {
					guildId: interaction.guildId ?? 'dm',
					userId: interaction.user.id,
					interactionId: interaction.id
				});
				return undefined;
			});
		}

		return interaction.reply(payload).catch((replyError) => {
			this.container.logger.error('[Tag] Failed to send reply after error', replyError, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			return undefined;
		});
	}

	private logSuccess(interaction: TagChatInputInteraction, stage: string) {
		const subcommand = interaction.options.getSubcommand(false);
		this.container.logger.debug('[Tag] Command succeeded', {
			stage,
			subcommand: subcommand ?? 'none',
			guildId: interaction.guildId ?? 'dm',
			userId: interaction.user.id,
			interactionId: interaction.id
		});
	}
}
