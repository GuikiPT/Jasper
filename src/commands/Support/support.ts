// Support command - admin utilities for support workflows
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	type SlashCommandBuilder,
	type SlashCommandBooleanOption,
	type SlashCommandSubcommandBuilder
} from 'discord.js';
import { chatInputSupportCleanInactiveThreads, type SupportCleanInteraction } from '../../subcommands/support/maintenance/clean-inactive-threads-db';

@ApplyOptions<Subcommand.Options>({
	name: 'support',
	description: 'Support utilities and maintenance commands.',
	detailedDescription: {
		summary: 'Admin-only support utilities, including cleaning inactive thread tracking records.',
		chatInputUsage: '/support <subcommand>',
		notes: ['Requires an allowed admin role or Manage Server permission.'],
		subcommands: [
			{
				name: 'clean-inactive-threads-db',
				description: 'Prune stale support thread tracking records.',
				chatInputUsage: '/support clean-inactive-threads-db [ephemeral]',
				notes: [
					'Requires an allowed admin role or Manage Server permission.',
					'Removes records for threads that are closed, resolved, deleted, or outside the configured forum.',
					'Use ephemeral:false to post results publicly.'
				]
			}
		]
	},
	fullCategory: ['Support'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 1,
	cooldownDelay: 10_000,
	cooldownScope: BucketScope.Guild,
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['allowedAdminRoles'] as const,
				allowManageGuild: true,
				errorMessage: 'You need an allowed admin role or Manage Server permission to run support maintenance commands.'
			}
		}
	],
	requiredClientPermissions: ['SendMessages'],
	subcommands: [
		{
			name: 'clean-inactive-threads-db',
			chatInputRun: 'chatInputSupportCleanInactiveThreads'
		}
	]
})
export class SupportCommand extends Subcommand {
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
					sub
						.setName('clean-inactive-threads-db')
						.setDescription('Prune stale support thread tracking records (inactive/resolved/deleted).')
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option.setName('ephemeral').setDescription('Reply privately (default: on)').setRequired(false)
						)
				)
		);
	}

	// ============================================================
	// Support Subcommand Handlers
	// ============================================================

	public async chatInputSupportCleanInactiveThreads(interaction: SupportCleanInteraction) {
		try {
			const result = await chatInputSupportCleanInactiveThreads(this, interaction);
			this.logSuccess(interaction, 'support clean-inactive-threads-db');
			return result;
		} catch (error) {
			return this.handleInteractionError(interaction, 'support clean-inactive-threads-db', error);
		}
	}

	private async handleInteractionError(interaction: SupportCleanInteraction, stage: string, error: unknown) {
		const subcommand = interaction.options.getSubcommand(false);
		this.container.logger.error('[Support] Command failed', error, {
			stage,
			subcommand: subcommand ?? 'none',
			guildId: interaction.guildId ?? 'dm',
			userId: interaction.user.id,
			interactionId: interaction.id
		});

		const payload = {
			content: 'I hit an error while processing that support command. Please try again.',
			ephemeral: true
		};

		if (interaction.replied || interaction.deferred) {
			return interaction.editReply({ content: payload.content }).catch((replyError) => {
				this.container.logger.error('[Support] Failed to edit reply after error', replyError, {
					guildId: interaction.guildId ?? 'dm',
					userId: interaction.user.id,
					interactionId: interaction.id
				});
				return undefined;
			});
		}

		return interaction.reply(payload).catch((replyError) => {
			this.container.logger.error('[Support] Failed to send reply after error', replyError, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			return undefined;
		});
	}

	private logSuccess(interaction: SupportCleanInteraction, stage: string) {
		const subcommand = interaction.options.getSubcommand(false);
		this.container.logger.debug('[Support] Command succeeded', {
			stage,
			subcommand: subcommand ?? 'none',
			guildId: interaction.guildId ?? 'dm',
			userId: interaction.user.id,
			interactionId: interaction.id
		});
	}
}
