// Clean inactive threads DB subcommand
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { Subcommand } from '@sapphire/plugin-subcommands';

export type SupportCleanInteraction = Subcommand.ChatInputCommandInteraction;

export async function chatInputSupportCleanInactiveThreads(interaction: SupportCleanInteraction) {
	if (!interaction.guildId) {
		return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
	}

	const monitor = interaction.container.supportThreadMonitor;
	if (!monitor) {
		interaction.container.logger.error('[SupportCleanInactiveThreads] SupportThreadMonitor is not available');
		return interaction.reply({ content: 'Support monitoring is unavailable right now.', flags: MessageFlags.Ephemeral });
	}

	const ephemeral = interaction.options.getBoolean('ephemeral', false) ?? true;
	const replyFlags = ephemeral ? MessageFlags.Ephemeral : undefined;
	await interaction.deferReply({ ephemeral, flags: replyFlags });

	const started = Date.now();
	const db = interaction.container.database;
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
		interaction.container.logger.error('[SupportCleanInactiveThreads] Failed to prune stale records', error, {
			guildId: interaction.guildId,
			userId: interaction.user.id,
			interactionId: interaction.id
		});
		return interaction.editReply('Failed to run cleanup. Please try again later.');
	}
}
