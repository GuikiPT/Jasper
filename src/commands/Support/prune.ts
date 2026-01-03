// Prune command - cleans up stale support thread tracking rows
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	type SlashCommandBuilder,
	type SlashCommandBooleanOption
} from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'support-prune-inactive-threads',
	description: 'Prune stale support thread tracking records.',
	detailedDescription: {
		summary: 'Scans the support thread tracking table and removes entries for threads that are already closed, resolved, deleted, or outside the configured forum.',
		notes: ['Requires an allowed admin role or Manage Server permission.']
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
				errorMessage: 'You need an allowed admin role or Manage Server permission to run this command.'
			}
		}
	],
	requiredClientPermissions: ['SendMessages']
})
export class SupportPruneCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addBooleanOption((option: SlashCommandBooleanOption) =>
					option
						.setName('ephemeral')
						.setDescription('Reply privately (default: on)')
						.setRequired(false)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
		}

		const monitor = this.container.supportThreadMonitor;
		if (!monitor) {
			this.container.logger.error('[SupportPrune] SupportThreadMonitor is not available');
			return interaction.reply({ content: 'Support monitoring is unavailable right now.', ephemeral: true });
		}

		const ephemeral = interaction.options.getBoolean('ephemeral', false) ?? true;
		await interaction.deferReply({ ephemeral });

		const started = Date.now();
		const db = this.container.database;
		const preCount = await db.supportThread.count();

		try {
			const { checked, deleted } = await monitor.pruneStaleThreadRecords();
			const postCount = await db.supportThread.count();
			const durationMs = Date.now() - started;
			const rate = durationMs > 0 ? (checked / (durationMs / 1000)).toFixed(1) : `${checked}`;
			const percent = preCount > 0 ? ((deleted / preCount) * 100).toFixed(1) : '0.0';

			const message = [
				`Cleanup finished in ${durationMs}ms (${rate} rows/s).`,
				`Scanned ${checked} record${checked === 1 ? '' : 's'} and removed ${deleted} stale entr${deleted === 1 ? 'y' : 'ies'} (${percent}%).`,
				`Remaining tracked rows: ${postCount}.`
			].join('\n');

			return interaction.editReply(message);
		} catch (error) {
			this.container.logger.error('[SupportPrune] Failed to prune stale records', error, {
				guildId: interaction.guildId,
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			return interaction.editReply('Failed to run cleanup. Please try again later.');
		}
	}
}
