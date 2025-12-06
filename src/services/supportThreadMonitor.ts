// Support thread monitor - Tracks inactivity and auto-closes support threads
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

// ============================================================
// Constants
// ============================================================

const DEFAULT_REMINDER_INTERVAL_MS = 15 * 1000; // 15 seconds (test cadence)
const MINIMUM_THRESHOLD_MINUTES = 1; // Sanity check to prevent overly aggressive reminders
const REOPEN_DELAY_MS = 1000; // Delay after reopening archived thread
const MESSAGE_FETCH_LIMIT = 100; // Limit for fetching initial messages

/**
 * Monitor for support thread inactivity
 * - Tracks last activity from thread owners
 * - Sends reminder messages after configured inactivity period
 * - Auto-closes threads after extended inactivity
 * - Applies resolved tags when closing
 * - Periodic maintenance sweep across all guilds
 */
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

    // ============================================================
    // Monitor Control
    // ============================================================

    /**
     * Starts the inactivity monitor
     * - Runs periodic maintenance sweeps
     * - Checks for threads needing reminders or closure
     * 
     * @param intervalMs Check interval in milliseconds (default: 15s)
     */
    public start(intervalMs: number = DEFAULT_REMINDER_INTERVAL_MS) {
        if (this.checkTimer) return;

        const effectiveInterval = Math.max(intervalMs, 1_000);
        this.logger.info('Starting inactivity monitor', { intervalMs, effectiveInterval });
        this.checkTimer = setInterval(() => void this.runMaintenance(), effectiveInterval);
        void this.runMaintenance();
    }

    /**
     * Stops the inactivity monitor
     * - Clears periodic maintenance timer
     */
    public stop() {
        if (!this.checkTimer) return;
        clearInterval(this.checkTimer);
        this.checkTimer = null;
        this.logger.info('Stopped inactivity monitor');
    }

    // ============================================================
    // Activity Tracking
    // ============================================================

    /**
     * Handles messages in support threads
     * - Tracks activity from thread owners
     * - Registers new threads for monitoring
     * - Dismisses reminder messages when owner responds
     * 
     * @param message Discord message
     */
    public async handleMessage(message: Message) {
        try {
            // Require guild context and ignore bots
            if (!message.guildId) return;
            if (message.author.bot) return;
            if (!message.channel || message.channel.type !== ChannelType.PublicThread) return;

            const thread = message.channel as ThreadChannel;
            
            // Verify thread is in configured support forum
            const settings = await this.supportSettingsService.getSettings(message.guildId);
            if (!settings || !settings.supportForumChannelId) return;
            if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) return;
            if (thread.parent.id !== settings.supportForumChannelId) return;

            const ownerId = await this.resolveThreadOwnerId(thread);
            if (!ownerId) return;

            const existingRecord = await this.supportThreadService.getThread(thread.id);

            // Handle owner activity
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

                // Dismiss reminder if it exists
                if (reminderMessageId) {
                    await this.dismissReminderMessage(thread, reminderMessageId);
                }
                return;
            }

            // Register new thread if not yet tracked
            if (!existingRecord) {
                const createdAt = thread.createdAt ?? new Date();
                
                // Find the first message from the thread owner
                let initialMessageId: string | undefined;
                try {
                    const messages = await thread.messages.fetch({ limit: MESSAGE_FETCH_LIMIT });
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
        } catch (error) {
            this.logger.error('Unhandled error in support thread message handler', error, {
                guildId: message.guildId,
                channelId: message.channel?.id,
                messageId: message.id
            });
        }
    }

    // ============================================================
    // Maintenance Sweeps
    // ============================================================

    /**
     * Runs periodic maintenance sweep
     * - Processes all guilds with configured support forums
     * - Sends reminders for inactive threads
     * - Auto-closes threads past threshold
     * - Prevents concurrent execution
     */
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

    /**
     * Processes reminders for a guild
     * - Finds threads past inactivity threshold
     * - Sends reminder messages
     */
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

    /**
     * Processes auto-closures for a guild
     * - Finds threads past auto-close threshold
     * - Closes and archives threads
     */
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

    // ============================================================
    // Reminder Logic
    // ============================================================

    /**
     * Sends inactivity reminder to thread owner
     * - Includes keep-open and close buttons
     * - Skips if no valid author message ID
     * - Marks thread as closed if no longer exists
     */
    private async sendReminder(record: SupportThreadRecord) {
        try {
            // Safety check: don't send reminders without valid author message ID
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

    // ============================================================
    // Auto-Close Logic
    // ============================================================

    /**
     * Auto-closes inactive support thread
     * - Applies resolved tag if configured
     * - Locks and archives thread
     * - Sends closure notification
     * - Dismisses reminder message
     * - Skips if no valid author message ID
     */
    private async autoCloseThread(record: SupportThreadRecord, settings: GuildSupportSettings) {
        try {
            // Safety check: don't auto-close without valid author message ID
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

            // Temporarily reopen if archived
            if (freshThread.archived) {
                await freshThread.setArchived(false, 'Temporarily reopening to close due to inactivity (self-jasper-check-protection).');
                await new Promise((resolve) => setTimeout(resolve, REOPEN_DELAY_MS));
            }

            // Apply resolved tag if configured
            if (resolvedTagId) {
                await this.applyResolvedTag(freshThread, resolvedTagId);
            }

            // Send closure notification
            const component = this.buildAutoCloseComponent(ownerId);
            await freshThread.send({
                components: [component],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { users: [ownerId], roles: [] }
            });

            // Dismiss reminder message if exists
            if (record.reminderMessageId) {
                await this.dismissReminderMessage(freshThread, record.reminderMessageId);
            }

            // Lock and archive thread
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

    // ============================================================
    // Component Building
    // ============================================================

    /**
     * Builds reminder message component
     * - Shows last activity timestamp
     * - Includes keep-open and close buttons
     */
    private buildReminderComponent(record: SupportThreadRecord, ownerId: string): ContainerBuilder {
        const container = new ContainerBuilder();
        const lastActivityTimestamp = Math.floor(record.lastAuthorMessageAt.getTime() / 1000);

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Still need help, <@${ownerId}>?`));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `We haven't seen a message from you since <t:${lastActivityTimestamp}:R>. Do you want to keep this thread open or close it?`
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

    /**
     * Builds auto-close notification component
     * - Informs user thread was closed
     * - Shows last active author
     */
    private buildAutoCloseComponent(ownerId: string): ContainerBuilder {
        const container = new ContainerBuilder();

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Thread closed due to inactivity'));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                'Because we didn\'t receive a response, the thread was closed automatically. If you still need help, please open a new thread.'
            )
        );
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Last active author: <@${ownerId}>`));

        return container;
    }

    // ============================================================
    // Helper Methods
    // ============================================================

    /**
     * Dismisses reminder message by deleting it
     */
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

    /**
     * Applies resolved tag to thread
     * - Removes duplicate tag if exists
     * - Ensures tag limit (5) is respected
     */
    private async applyResolvedTag(thread: ThreadChannel, resolvedTagId: string) {
        try {
            let newTags = [...thread.appliedTags];
            
            // Remove existing resolved tag if present
            newTags = newTags.filter((tagId) => tagId !== resolvedTagId);
            
            // Ensure tag limit
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

    /**
     * Fetches support thread channel
     */
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

    /**
     * Resolves thread owner ID
     */
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

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
    interface Container {
        supportThreadMonitor: SupportThreadMonitor;
    }
}
