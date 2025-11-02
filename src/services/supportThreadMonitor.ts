// supportThreadMonitor module within services
import type { GuildSupportSettings, PrismaClient, SupportThread as SupportThreadRecord } from '@prisma/client';
import type { SapphireClient } from '@sapphire/framework';
import {
	ChannelType,
	MessageFlags,
	type Message,
	type ThreadChannel,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle
} from 'discord.js';
import { createSubsystemLogger } from '../lib/subsystemLogger';
import { SUPPORT_THREAD_ACTION_CLOSE, SUPPORT_THREAD_ACTION_KEEP_OPEN, SUPPORT_THREAD_BUTTON_PREFIX } from '../lib/supportThreadConstants.js';
import { GuildSupportSettingsService } from './guildSupportSettingsService';
import { SupportThreadService } from './supportThreadService';

const DEFAULT_REMINDER_INTERVAL_MS = 15 * 1000; // 15 seconds (test cadence)
const MINIMUM_THRESHOLD_MINUTES = 1; // sanity check to prevent overly aggressive reminders

export class SupportThreadMonitor {
	private checkTimer: NodeJS.Timeout | null = null;
	private maintenanceRunning = false;
	private readonly logger = createSubsystemLogger('SupportThreadMonitor');

	public constructor(
		private readonly client: SapphireClient,
		private readonly supportThreadService: SupportThreadService,
		private readonly supportSettingsService: GuildSupportSettingsService,
		private readonly database: PrismaClient
	) {}

	public start(intervalMs: number = DEFAULT_REMINDER_INTERVAL_MS) {
		if (this.checkTimer) return;

		const effectiveInterval = Math.max(intervalMs, 1_000);
		this.logger.info('Starting inactivity monitor', { intervalMs, effectiveInterval });
		this.checkTimer = setInterval(() => void this.runMaintenance(), effectiveInterval);
		void this.runMaintenance();
	}

	public stop() {
		if (!this.checkTimer) return;
		clearInterval(this.checkTimer);
		this.checkTimer = null;
		this.logger.info('Stopped inactivity monitor');
	}

	public async handleMessage(message: Message) {
		if (!message.guildId) return;
		if (message.author.bot) return;
		if (!message.channel || message.channel.type !== ChannelType.PublicThread) return;

		const thread = message.channel as ThreadChannel;
		const settings = await this.supportSettingsService.getSettings(message.guildId);
		if (!settings || !settings.supportForumChannelId) return;
		if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) return;
		if (thread.parent.id !== settings.supportForumChannelId) return;

		const ownerId = await this.resolveThreadOwnerId(thread);
		if (!ownerId) return;

		const existingRecord = await this.supportThreadService.getThread(thread.id);

		if (message.author.id === ownerId) {
			const reminderMessageId = existingRecord?.reminderMessageId ?? null;
			await this.supportThreadService.recordAuthorActivity({
				threadId: thread.id,
				guildId: message.guildId,
				authorId: ownerId,
				timestamp: message.createdAt,
				messageId: message.id
			});
			this.logger.debug('Recorded author activity', {
				threadId: thread.id,
				guildId: message.guildId,
				authorId: ownerId,
				messageId: message.id,
				reminderMessageId
			});

			if (reminderMessageId) {
				await this.dismissReminderMessage(thread, reminderMessageId);
			}
			return;
		}

		if (!existingRecord) {
			const createdAt = thread.createdAt ?? new Date();
			// Find the first message from the thread owner to use as the initial message ID
			let initialMessageId: string | undefined;
			try {
				const messages = await thread.messages.fetch({ limit: 100 });
				const firstOwnerMessage = messages
					.filter((m) => m.author.id === ownerId)
					.sort((a, b) => a.createdTimestamp - b.createdTimestamp)
					.first();
				initialMessageId = firstOwnerMessage?.id;
			} catch (error) {
				this.logger.debug('Failed to fetch initial owner message', {
					threadId: thread.id,
					error
				});
			}

			await this.supportThreadService.recordAuthorActivity({
				threadId: thread.id,
				guildId: message.guildId,
				authorId: ownerId,
				timestamp: createdAt,
				messageId: initialMessageId ?? message.id
			});
			this.logger.info('Registered support thread for inactivity tracking', {
				threadId: thread.id,
				guildId: message.guildId,
				authorId: ownerId,
				registeredAt: createdAt.toISOString(),
				initialMessageId
			});
		}
	}

	private async runMaintenance() {
		if (this.maintenanceRunning) return;
		this.maintenanceRunning = true;

		try {
			const guildSettings = await this.database.guildSupportSettings.findMany({
				where: { supportForumChannelId: { not: null } }
			});

			const now = Date.now();
			this.logger.debug('Maintenance sweep started', { guildCount: guildSettings.length, now });

			for (const settings of guildSettings) {
				const inactivityMinutes = Math.max(settings.inactivityReminderMinutes ?? 2880, MINIMUM_THRESHOLD_MINUTES);
				const autoCloseMinutes = Math.max(settings.autoCloseMinutes ?? 1440, MINIMUM_THRESHOLD_MINUTES);
				this.logger.debug('Evaluating guild for inactivity', {
					guildId: settings.guildId,
					supportForumChannelId: settings.supportForumChannelId,
					inactivityMinutes,
					autoCloseMinutes
				});
				await this.processRemindersForGuild(settings, now, inactivityMinutes);
				await this.processAutoClosuresForGuild(settings, now, autoCloseMinutes);
			}
			this.logger.debug('Maintenance sweep finished', { guildCount: guildSettings.length });
		} catch (error) {
			this.logger.error('Maintenance run failed', error);
		} finally {
			this.maintenanceRunning = false;
		}
	}

	private async processRemindersForGuild(settings: GuildSupportSettings, nowMs: number, inactivityMinutes: number) {
		const cutoff = new Date(nowMs - inactivityMinutes * 60 * 1000);
		const threads = await this.supportThreadService.findThreadsNeedingReminder(cutoff, {
			guildId: settings.guildId
		});
		this.logger.debug('Threads needing reminder', {
			guildId: settings.guildId,
			count: threads.length,
			cutoff: cutoff.toISOString()
		});

		for (const record of threads) {
			await this.sendReminder(record);
		}
	}

	private async processAutoClosuresForGuild(settings: GuildSupportSettings, nowMs: number, autoCloseMinutes: number) {
		const cutoff = new Date(nowMs - autoCloseMinutes * 60 * 1000);
		const threads = await this.supportThreadService.findThreadsNeedingAutoClose(cutoff, {
			guildId: settings.guildId
		});
		this.logger.debug('Threads needing auto-close', {
			guildId: settings.guildId,
			count: threads.length,
			cutoff: cutoff.toISOString()
		});

		for (const record of threads) {
			await this.autoCloseThread(record, settings);
		}
	}

	private async sendReminder(record: SupportThreadRecord) {
		try {
			// Safety check: don't send reminders if we don't have a valid author message ID
			if (!record.lastAuthorMessageId) {
				this.logger.debug('Skipping reminder for thread without valid author message ID', {
					threadId: record.threadId,
					guildId: record.guildId
				});
				return;
			}

			const thread = await this.fetchSupportThread(record.threadId);
			if (!thread) {
				await this.supportThreadService.markThreadClosed(record.threadId);
				return;
			}

			const ownerId = await this.resolveThreadOwnerId(thread);
			if (!ownerId) {
				await this.supportThreadService.markThreadClosed(record.threadId);
				return;
			}

			const component = this.buildReminderComponent(record, ownerId);
			const message = await thread.send({
				components: [component],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [ownerId], roles: [] }
			});

			await this.supportThreadService.markReminderSent({
				threadId: record.threadId,
				timestamp: new Date(),
				messageId: message.id
			});
			this.logger.info('Sent inactivity reminder', {
				threadId: record.threadId,
				guildId: record.guildId,
				ownerId,
				messageId: message.id
			});
		} catch (error) {
			this.logger.warn('Failed to send inactivity reminder', error, {
				threadId: record.threadId,
				guildId: record.guildId
			});
		}
	}

	private async autoCloseThread(record: SupportThreadRecord, settings: GuildSupportSettings) {
		try {
			// Safety check: don't auto-close if we don't have a valid author message ID
			if (!record.lastAuthorMessageId) {
				this.logger.debug('Skipping auto-close for thread without valid author message ID', {
					threadId: record.threadId,
					guildId: record.guildId
				});
				return;
			}

			const thread = await this.fetchSupportThread(record.threadId);
			if (!thread) {
				await this.supportThreadService.markThreadClosed(record.threadId);
				return;
			}

			const ownerId = await this.resolveThreadOwnerId(thread);
			if (!ownerId) {
				await this.supportThreadService.markThreadClosed(record.threadId);
				return;
			}

			const forumChannelId = settings.supportForumChannelId;
			if (!forumChannelId || !thread.parent || thread.parent.id !== forumChannelId) {
				await this.supportThreadService.markThreadClosed(record.threadId);
				return;
			}

			const resolvedTagId = settings.resolvedTagId;
			const freshThread = await thread.fetch();

			if (freshThread.archived) {
				await freshThread.setArchived(false, 'Temporarily reopening to close due to inactivity (self-jasper-check-protection).');
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			if (resolvedTagId) {
				await this.applyResolvedTag(freshThread, resolvedTagId);
			}

			const component = this.buildAutoCloseComponent(ownerId);
			await freshThread.send({
				components: [component],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [ownerId], roles: [] }
			});

			if (record.reminderMessageId) {
				await this.dismissReminderMessage(freshThread, record.reminderMessageId);
			}

			await freshThread.setLocked(true, "I'm closing the thread automatically after op inactivity");
			await freshThread.setArchived(true, "I'm closing the thread automatically after op inactivity");

			await this.supportThreadService.markThreadClosed(record.threadId);
			this.logger.info('Auto-closed inactive support thread', {
				threadId: record.threadId,
				guildId: record.guildId,
				ownerId
			});
		} catch (error) {
			this.logger.error('Failed to auto-close support thread', error, {
				threadId: record.threadId,
				guildId: record.guildId
			});
		}
	}

	private buildReminderComponent(record: SupportThreadRecord, ownerId: string): ContainerBuilder {
		const container = new ContainerBuilder();
		const lastActivityTimestamp = Math.floor(record.lastAuthorMessageAt.getTime() / 1000);

		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Still need help, <@${ownerId}>?`));
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`We haven’t seen a message from you since <t:${lastActivityTimestamp}:R>. Do you want to keep this thread open or close it?`
			)
		);
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Choose an option below to continue.'));

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`${SUPPORT_THREAD_BUTTON_PREFIX}:${SUPPORT_THREAD_ACTION_KEEP_OPEN}:${record.threadId}`)
				.setLabel('Keep open')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(`${SUPPORT_THREAD_BUTTON_PREFIX}:${SUPPORT_THREAD_ACTION_CLOSE}:${record.threadId}`)
				.setLabel('Close thread')
				.setStyle(ButtonStyle.Danger)
		);

		container.addActionRowComponents(row);

		return container;
	}

	private buildAutoCloseComponent(ownerId: string): ContainerBuilder {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Thread closed due to inactivity'));
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				'Because we didn’t receive a response, the thread was closed automatically. If you still need help, please open a new thread.'
			)
		);
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Last active author: <@${ownerId}>`));

		return container;
	}

	private async dismissReminderMessage(thread: ThreadChannel, messageId: string) {
		try {
			const reminderMessage = await thread.messages.fetch(messageId);
			await reminderMessage.delete();
		} catch (error) {
			this.logger.debug('Failed to remove reminder message', {
				threadId: thread.id,
				messageId,
				error
			});
		}
	}

	private async applyResolvedTag(thread: ThreadChannel, resolvedTagId: string) {
		try {
			let newTags = [...thread.appliedTags];
			newTags = newTags.filter((tagId) => tagId !== resolvedTagId);
			if (newTags.length >= 5) {
				newTags = newTags.slice(-4);
			}
			newTags.push(resolvedTagId);

			await thread.setAppliedTags(newTags, 'Marking as resolved due to inactivity');
		} catch (error) {
			this.logger.debug('Failed to apply resolved tag during auto-close', {
				threadId: thread.id,
				resolvedTagId,
				error
			});
		}
	}

	private async fetchSupportThread(threadId: string): Promise<ThreadChannel | null> {
		try {
			const channel = await this.client.channels.fetch(threadId);
			if (!channel || channel.type !== ChannelType.PublicThread) return null;
			return channel as ThreadChannel;
		} catch (error) {
			this.logger.debug('Failed to fetch thread channel', { threadId, error });
			return null;
		}
	}

	private async resolveThreadOwnerId(thread: ThreadChannel): Promise<string | null> {
		if (thread.ownerId) return thread.ownerId;
		try {
			const owner = await thread.fetchOwner();
			return owner?.id ?? null;
		} catch (error) {
			this.logger.debug('Failed to resolve thread owner', {
				threadId: thread.id,
				error
			});
			return null;
		}
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		supportThreadMonitor: SupportThreadMonitor;
	}
}
