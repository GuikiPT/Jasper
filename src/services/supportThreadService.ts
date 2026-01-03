// Support thread service - Database operations for support thread inactivity tracking
import type { PrismaClient, SupportThread } from '@prisma/client';
import { createSubsystemLogger } from '../lib/subsystemLogger';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Payload for recording thread owner activity
 */
export interface SupportThreadActivityPayload {
	threadId: string;
	guildId: string;
	authorId: string;
	timestamp: Date;
	messageId?: string;
}

/**
 * Payload for recording reminder sent
 */
export interface SupportThreadReminderPayload {
	threadId: string;
	timestamp: Date;
	messageId: string | null;
}

/**
 * Service for managing support thread activity records
 * - Tracks last activity from thread owners
 * - Records reminder messages sent
 * - Queries threads needing reminders or auto-closure
 * - Manages thread lifecycle (active/closed)
 */
export class SupportThreadService {
	private readonly logger = createSubsystemLogger('SupportThreadService');

	public constructor(private readonly database: PrismaClient) { }

	// ============================================================
	// Thread Retrieval
	// ============================================================

	/**
	 * Gets a support thread record by ID
	 *
	 * @param threadId Thread ID
	 * @returns Thread record or null if not found
	 */
	public getThread(threadId: string): Promise<SupportThread | null> {
		return this.database.supportThread.findUnique({ where: { threadId } });
	}

	/**
	 * Lists tracked threads with cursor-based pagination
	 * - Used by maintenance jobs and admin cleanup commands
	 *
	 * @param options.batchSize Number of rows to fetch per page (default: 500)
	 * @param options.cursor Thread ID to resume from (exclusive)
	 */
	public listTrackedThreads(options: { batchSize?: number; cursor?: string | null } = {}): Promise<SupportThread[]> {
		const { batchSize = 500, cursor = null } = options;

		return this.database.supportThread.findMany({
			take: batchSize,
			orderBy: { threadId: 'asc' },
			...(cursor
				? {
					skip: 1,
					cursor: { threadId: cursor }
				}
				: {})
		});
	}

	// ============================================================
	// Activity Recording
	// ============================================================

	/**
	 * Records activity from thread owner
	 * - Creates record if thread not yet tracked
	 * - Updates last activity timestamp
	 * - Resets reminder state (clears sent reminders)
	 * - Reopens thread if previously closed
	 *
	 * @param payload Activity data
	 * @returns Updated thread record
	 */
	public async recordAuthorActivity(payload: SupportThreadActivityPayload): Promise<SupportThread> {
		const record = await this.database.supportThread.upsert({
			where: { threadId: payload.threadId },
			create: {
				threadId: payload.threadId,
				guildId: payload.guildId,
				authorId: payload.authorId,
				lastAuthorMessageAt: payload.timestamp,
				lastAuthorMessageId: payload.messageId ?? null
			},
			update: {
				authorId: payload.authorId,
				lastAuthorMessageAt: payload.timestamp,
				lastAuthorMessageId: payload.messageId ?? null,
				closedAt: null, // Reopen if closed
				lastReminderAt: null, // Reset reminder state
				reminderMessageId: null,
				reminderCount: 0
			}
		});

		this.logger.debug('Support thread activity recorded', {
		});

		return record;
	}

	/**
	 * Records that a reminder was sent
	 * - Updates last reminder timestamp
	 * - Stores reminder message ID for later dismissal
	 * - Increments reminder counter
	 *
	 * @param payload Reminder data
	 * @returns Updated thread record
	 */
	public async markReminderSent(payload: SupportThreadReminderPayload): Promise<SupportThread> {
		const record = await this.database.supportThread.update({
			where: { threadId: payload.threadId },
			data: {
				lastReminderAt: payload.timestamp,
				reminderMessageId: payload.messageId,
				reminderCount: { increment: 1 }
			}
		});

		this.logger.info('Support thread reminder marked sent', {
			threadId: payload.threadId,
			messageId: payload.messageId,
			timestamp: payload.timestamp.toISOString()
		});

		return record;
	}

	// ============================================================
	// Thread Lifecycle
	// ============================================================

	/**
	 * Marks a thread as closed
	 * - Deletes the tracking row so closed/resolved threads don't pile up
	 * - Stops further monitoring and lets future activity recreate the record
	 *
	 * @param threadId Thread ID
	 */
	public async markThreadClosed(threadId: string): Promise<void> {
		const result = await this.database.supportThread.deleteMany({
			where: { threadId }
		});

		this.logger.info('Support thread closed and pruned', {
			threadId,
			deletedCount: result.count
		});
	}

	/**
	 * Clears reminder state for a thread
	 * - Used when owner manually dismisses reminder
	 * - Resets reminder timestamp and message ID
	 *
	 * @param threadId Thread ID
	 */
	public async clearReminder(threadId: string): Promise<void> {
		await this.database.supportThread.updateMany({
			where: { threadId },
			data: {
				lastReminderAt: null,
				reminderMessageId: null
			}
		});

		this.logger.debug('Support thread reminder cleared', { threadId });
	}

	// ============================================================
	// Query Methods
	// ============================================================

	/**
	 * Finds threads needing inactivity reminders
	 * - Thread must be open (not closed)
	 * - Must have valid author message ID
	 * - Last activity before cutoff
	 * - No reminder sent, or last reminder before cutoff
	 *
	 * @param cutoff Inactivity threshold timestamp
	 * @param options Query options (optional guild filter)
	 * @returns Array of thread records needing reminders
	 */
	public async findThreadsNeedingReminder(cutoff: Date, options: { guildId?: string } = {}): Promise<SupportThread[]> {
		const { guildId } = options;
		const threads = await this.database.supportThread.findMany({
			where: {
				closedAt: null,
				lastAuthorMessageId: { not: null }, // Only send reminders if we have a valid author message
				lastAuthorMessageAt: { lt: cutoff },
				OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }],
				...(guildId ? { guildId } : {})
			}
		});

		if (threads.length > 0) {
			this.logger.debug('Threads needing reminders', {
				guildId: guildId ?? 'all',
				count: threads.length
			});
		}

		return threads;
	}

	/**
	 * Finds threads needing auto-closure
	 * - Thread must be open (not closed)
	 * - Must have valid author message ID
	 * - Reminder must have been sent
	 * - Last activity and reminder both before cutoff
	 *
	 * @param reminderCutoff Auto-close threshold timestamp
	 * @param options Query options (optional guild filter)
	 * @returns Array of thread records needing closure
	 */
	public async findThreadsNeedingAutoClose(reminderCutoff: Date, options: { guildId?: string } = {}): Promise<SupportThread[]> {
		const { guildId } = options;
		const threads = await this.database.supportThread.findMany({
			where: {
				closedAt: null,
				lastAuthorMessageId: { not: null }, // Only auto-close if we have a valid author message
				lastReminderAt: { not: null, lt: reminderCutoff },
				lastAuthorMessageAt: { lt: reminderCutoff },
				...(guildId ? { guildId } : {})
			}
		});

		if (threads.length > 0) {
			this.logger.debug('Threads needing auto-close', {
				guildId: guildId ?? 'all',
				count: threads.length
			});
		}

		return threads;
	}
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
	interface Container {
		supportThreadService: SupportThreadService;
	}
}
