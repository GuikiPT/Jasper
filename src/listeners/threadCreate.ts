// Thread create listener - Handles support thread initialization and first message pinning
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ThreadChannel, MessageType } from 'discord.js';

// Delay before attempting to delete pin notification
const PIN_NOTIFICATION_DELETE_DELAY_MS = 1000;

@ApplyOptions<Listener.Options>({ event: Events.ThreadCreate, once: false })
export class UserEvent extends Listener {
    /**
     * Handles thread creation events
     * - Identifies support threads
     * - Pins the first message from thread owner
     * - Removes pin notification message
     */
    public override async run(thread: ThreadChannel, newlyCreated: boolean) {
        try {
            this.container.logger.debug('Thread created', {
                id: thread.id,
                name: thread.name,
                guildId: thread.guildId,
                ownerId: thread.ownerId,
                newlyCreated
            });

            // Check if this is a support thread
            const isSupportThread = await this.isSupportThread(thread);

            this.container.logger.debug('Thread type determined', {
                threadId: thread.id,
                isSupportThread
            });

            // Only proceed with pinning logic for support threads
            if (!isSupportThread) {
                this.container.logger.debug('Skipping thread processing - not a support thread', {
                    threadId: thread.id
                });
                return;
            }

            // Process only newly created threads
            if (newlyCreated) {
                await this.handleNewSupportThread(thread);
            }
        } catch (error) {
            this.container.logger.error('Unhandled error in threadCreate listener', error, {
                threadId: thread.id,
                guildId: thread.guildId
            });
        }
    }

    // ============================================================
    // Support Thread Handling
    // ============================================================

    /**
     * Handles newly created support threads
     * - Pins the first message from thread owner
     * - Deletes the pin notification
     */
    private async handleNewSupportThread(thread: ThreadChannel) {
        try {
            // Fetch the first message (thread starter message)
            const message = await thread.messages.fetch(thread.id);

            // Verify thread owner
            const threadOwnerId = thread.ownerId || (await this.resolveThreadOwnerId(thread));
            if (!threadOwnerId) {
                this.container.logger.debug('Could not determine thread owner, skipping pin logic', {
                    threadId: thread.id
                });
                return;
            }

            // Only pin if the first message is from the thread owner
            if (message.author.id !== threadOwnerId) {
                this.container.logger.debug('First message is not from thread owner, skipping pin', {
                    threadId: thread.id,
                    messageAuthorId: message.author.id,
                    threadOwnerId
                });
                return;
            }

            this.container.logger.debug('First support message detected from thread owner', {
                id: message.id,
                channelId: message.channelId,
                guildId: message.guildId,
                authorId: message.author?.id,
                content: message.content.substring(0, 100) // Log first 100 chars only
            });

            // Pin the first support message
            await message.pin();
            this.container.logger.debug('Successfully pinned the first support message', {
                threadId: thread.id,
                messageId: message.id
            });

            // Delete pin notification after a short delay
            await this.deletePinNotification(thread);
        } catch (error) {
            this.container.logger.error('Failed to fetch or pin first message in support thread', error, {
                threadId: thread.id,
                guildId: thread.guildId
            });
        }
    }

    /**
     * Deletes the automatic pin notification message
     * - Waits for notification to be sent
     * - Finds and deletes ChannelPinnedMessage type
     */
    private async deletePinNotification(thread: ThreadChannel) {
        setTimeout(async () => {
            try {
                const messages = await thread.messages.fetch({ limit: 5 });
                const notification = messages.find((m) => m.type === MessageType.ChannelPinnedMessage);
                
                if (notification) {
                    await notification.delete();
                    this.container.logger.debug('Deleted pin notification message for support thread', {
                        threadId: thread.id,
                        notificationId: notification.id
                    });
                } else {
                    this.container.logger.debug('No pin notification found to delete', {
                        threadId: thread.id
                    });
                }
            } catch (error) {
                this.container.logger.error('Failed to delete pin notification in support thread', error, {
                    threadId: thread.id,
                    guildId: thread.guildId
                });
            }
        }, PIN_NOTIFICATION_DELETE_DELAY_MS);
    }

    // ============================================================
    // Helper Methods
    // ============================================================

    /**
     * Determines if a thread is a support thread
     * - Checks guild context
     * - Verifies parent channel matches configured support forum
     * 
     * @param thread Thread to check
     * @returns True if thread is in configured support forum
     */
    private async isSupportThread(thread: ThreadChannel): Promise<boolean> {
        // Must be in a guild
        if (!thread.guildId) {
            return false;
        }

        // Must have a parent channel (forum)
        if (!thread.parent) {
            return false;
        }

        // Get guild support settings
        const supportSettingsService = this.container.guildSupportSettingsService;
        if (!supportSettingsService) {
            this.container.logger.debug('Support settings service not available');
            return false;
        }

        try {
            const settings = await supportSettingsService.getSettings(thread.guildId);

            // Check if support forum is configured and matches this thread's parent
            const isSupportForum = settings?.supportForumChannelId === thread.parent.id;

            this.container.logger.debug('Support thread check completed', {
                threadId: thread.id,
                parentId: thread.parent.id,
                configuredForumId: settings?.supportForumChannelId,
                isSupportForum
            });

            return isSupportForum;
        } catch (error) {
            this.container.logger.error('Failed to check if thread is support thread', error, {
                threadId: thread.id,
                guildId: thread.guildId
            });
            return false;
        }
    }

    /**
     * Resolves thread owner ID from thread object or API
     * 
     * @param thread Thread to resolve owner for
     * @returns Owner user ID or null if unable to resolve
     */
    private async resolveThreadOwnerId(thread: ThreadChannel): Promise<string | null> {
        if (thread.ownerId) return thread.ownerId;

        try {
            const owner = await thread.fetchOwner();
            return owner?.id ?? null;
        } catch (error) {
            this.container.logger.debug('Failed to resolve thread owner', {
                threadId: thread.id,
                error
            });
            return null;
        }
    }
}
