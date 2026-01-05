// Reminder service - Monitors and sends reminders to users
import type { PrismaClient } from '@prisma/client';
import type { SapphireClient } from '@sapphire/framework';
import {
	ChannelType,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	MessageFlags
} from 'discord.js';
import { createSubsystemLogger } from '../lib/subsystemLogger';

// ============================================================
// Constants
// ============================================================

const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const BATCH_SIZE = 50; // Process reminders in batches

/**
 * Monitor for due reminders
 * - Checks for reminders that need to be sent every minute
 * - Sends DM or channel message to users
 * - Automatically deletes reminders after sending
 */
export class ReminderService {
	private checkTimer: NodeJS.Timeout | null = null;
	private isProcessing = false;
	private readonly logger = createSubsystemLogger('ReminderService');

	public constructor(
		private readonly client: SapphireClient,
		private readonly database: PrismaClient
	) { }

	// ============================================================
	// Service Control
	// ============================================================

	/**
	 * Starts the reminder service
	 * - Runs periodic checks for due reminders
	 *
	 * @param intervalMs Check interval in milliseconds (default: 60s)
	 */
	public start(intervalMs: number = CHECK_INTERVAL_MS) {
		if (this.checkTimer) {
			this.logger.warn('Reminder service already running');
			return;
		}

		this.logger.info(`Starting reminder service (check interval: ${intervalMs}ms)`);
		this.checkTimer = setInterval(() => void this.checkReminders(), intervalMs);

		// Run immediately on startup
		void this.checkReminders();
	}

	/**
	 * Stops the reminder service
	 */
	public stop() {
		if (this.checkTimer) {
			clearInterval(this.checkTimer);
			this.checkTimer = null;
			this.logger.info('Reminder service stopped');
		}
	}

	// ============================================================
	// Reminder Processing
	// ============================================================

	/**
	 * Check for and process due reminders
	 */
	private async checkReminders() {
		if (this.isProcessing) {
			this.logger.debug('Already processing reminders, skipping this cycle');
			return;
		}

		this.isProcessing = true;

		try {
			// Fetch due reminders
			const dueReminders = await this.database.reminder.findMany({
				where: {
					remindAt: {
						lte: new Date()
					}
				},
				take: BATCH_SIZE,
				orderBy: {
					remindAt: 'asc'
				}
			});

			if (dueReminders.length === 0) {
				this.logger.debug('No due reminders found');
				return;
			}

			this.logger.info(`Processing ${dueReminders.length} due reminder(s)`);

			// Process each reminder
			for (const reminder of dueReminders) {
				try {
					await this.sendReminder(reminder);

					// Delete the reminder after sending
					await this.database.reminder.delete({
						where: { id: reminder.id }
					});

					this.logger.debug(`Sent and deleted reminder ${reminder.id} for user ${reminder.userId}`);
				} catch (error) {
					this.logger.error(`Failed to process reminder ${reminder.id}:`, error);

					// If the reminder is overdue by >1 hour, delete it to prevent infinite retry loops
					const hoursSinceRemindAt = (Date.now() - reminder.remindAt.getTime()) / (1000 * 60 * 60);
					if (hoursSinceRemindAt > 1) {
						this.logger.warn(`Deleting failed reminder ${reminder.id} (${hoursSinceRemindAt.toFixed(1)}h overdue)`);
						await this.database.reminder.delete({
							where: { id: reminder.id }
						}).catch((deleteError: unknown) => {
							this.logger.error(`Failed to delete failed reminder ${reminder.id}:`, deleteError);
						});
					}
				}
			}
		} catch (error) {
			this.logger.error('Error checking reminders:', error);
		} finally {
			this.isProcessing = false;
		}
	}

	/**
	 * Send a reminder to a user
	 */
	private async sendReminder(reminder: {
		id: number;
		uuid: string;
		userId: string;
		guildId: string | null;
		channelId: string;
		message: string;
		remindAt: Date;
		createdAt: Date;
	}) {
		try {
			// Try to fetch the user
			const user = await this.client.users.fetch(reminder.userId).catch(() => null);

			if (!user) {
				this.logger.warn(`User ${reminder.userId} not found for reminder ${reminder.id}`);
				return;
			}

			// Build Components V2 reminder message
			const components = [
				new TextDisplayBuilder().setContent(`<@${reminder.userId}>`),
				new ContainerBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent('### ⏰ Reminder')
					)
					.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
					)
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`***You asked me to remind you about:***\n> ${reminder.message}`)
					)
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`-# ${reminder.uuid} • <t:${Math.floor(reminder.createdAt.getTime() / 1000)}:R>`)
					)
			];

			// Try to send via DM first
			let sent = false;

			try {
				await user.send({
					components,
					flags: MessageFlags.IsComponentsV2
				});
				sent = true;
				this.logger.debug(`Sent reminder ${reminder.id} via DM to user ${reminder.userId}`);
			} catch (dmError) {
				this.logger.debug(`Could not send reminder ${reminder.id} via DM (${dmError instanceof Error ? dmError.message : String(dmError)}), trying channel ${reminder.channelId}`);
			}

			// If DM failed, try the channel
			if (!sent && reminder.channelId) {
				try {
					const channel = await this.client.channels.fetch(reminder.channelId).catch(() => null);

					if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.DM)) {
						await channel.send({
							components,
							flags: MessageFlags.IsComponentsV2
						});
						sent = true;
						this.logger.debug(`Sent reminder ${reminder.id} to channel ${reminder.channelId}`);
					} else {
						this.logger.debug(`Channel ${reminder.channelId} not found or wrong type for reminder ${reminder.id}`);
					}
				} catch (channelError) {
					this.logger.error(`Could not send reminder ${reminder.id} to channel ${reminder.channelId}: ${channelError instanceof Error ? channelError.message : String(channelError)}`);
				}
			}

			// If both failed, log error
			if (!sent) {
				this.logger.error(`Failed to send reminder ${reminder.id} - both DM and channel delivery failed`);
				throw new Error('Could not deliver reminder');
			}
		} catch (error) {
			this.logger.error(`Error sending reminder ${reminder.id}`);
			throw error;
		}
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		reminderService: ReminderService;
	}
}
