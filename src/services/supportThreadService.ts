// supportThreadService module within services
import type { PrismaClient, SupportThread } from '@prisma/client';

export interface SupportThreadActivityPayload {
	threadId: string;
	guildId: string;
	authorId: string;
	timestamp: Date;
}

export interface SupportThreadReminderPayload {
	threadId: string;
	timestamp: Date;
	messageId: string | null;
}

export class SupportThreadService {
	public constructor(private readonly database: PrismaClient) {}

	public getThread(threadId: string): Promise<SupportThread | null> {
		return this.database.supportThread.findUnique({ where: { threadId } });
	}

	public async recordAuthorActivity(payload: SupportThreadActivityPayload): Promise<SupportThread> {
		return this.database.supportThread.upsert({
			where: { threadId: payload.threadId },
			create: {
				threadId: payload.threadId,
				guildId: payload.guildId,
				authorId: payload.authorId,
				lastAuthorMessageAt: payload.timestamp
			},
			update: {
				authorId: payload.authorId,
				lastAuthorMessageAt: payload.timestamp,
				closedAt: null,
				lastReminderAt: null,
				reminderMessageId: null,
				reminderCount: 0
			}
		});
	}

	public async markReminderSent(payload: SupportThreadReminderPayload): Promise<SupportThread> {
		return this.database.supportThread.update({
			where: { threadId: payload.threadId },
			data: {
				lastReminderAt: payload.timestamp,
				reminderMessageId: payload.messageId,
				reminderCount: { increment: 1 }
			}
		});
	}

	public async markThreadClosed(threadId: string): Promise<void> {
		await this.database.supportThread.updateMany({
			where: { threadId },
			data: {
				closedAt: new Date(),
				reminderMessageId: null
			}
		});
	}

	public async clearReminder(threadId: string): Promise<void> {
		await this.database.supportThread.updateMany({
			where: { threadId },
			data: {
				lastReminderAt: null,
				reminderMessageId: null
			}
		});
	}

	public async findThreadsNeedingReminder(cutoff: Date, options: { guildId?: string } = {}): Promise<SupportThread[]> {
		const { guildId } = options;
		return this.database.supportThread.findMany({
			where: {
				closedAt: null,
				lastAuthorMessageAt: { lt: cutoff },
				OR: [
					{ lastReminderAt: null },
					{ lastReminderAt: { lt: cutoff } }
				],
				...(guildId ? { guildId } : {})
			}
		});
	}

	public async findThreadsNeedingAutoClose(reminderCutoff: Date, options: { guildId?: string } = {}): Promise<SupportThread[]> {
		const { guildId } = options;
		return this.database.supportThread.findMany({
			where: {
				closedAt: null,
				lastReminderAt: { not: null, lt: reminderCutoff },
				lastAuthorMessageAt: { lt: reminderCutoff },
				...(guildId ? { guildId } : {})
			}
		});
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		supportThreadService: SupportThreadService;
	}
}
