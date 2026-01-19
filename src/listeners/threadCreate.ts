// Thread create listener - Handles support thread initialization and first message pinning
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ThreadChannel, MessageType } from 'discord.js';

// Delay before attempting to delete pin notification
const PIN_NOTIFICATION_DELETE_DELAY_MS = 1000;

// Message fetch retry configuration
const MAX_FETCH_ATTEMPTS = 6;
const INITIAL_RETRY_DELAY_MS = 500; // Start with 500ms
const MAX_RETRY_DELAY_MS = 5000; // Cap at 5 seconds

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
			// Verify thread owner
			const threadOwnerId = thread.ownerId || (await this.resolveThreadOwnerId(thread));
			if (!threadOwnerId) {
				this.container.logger.debug('Could not determine thread owner, skipping pin logic', {
					threadId: thread.id
				});
				return;
			}

			// Retry fetching messages with dynamic wait
			const message = await this.fetchFirstOwnerMessage(thread, threadOwnerId);

			if (!message) {
				this.container.logger.debug('No message from thread owner found after retries, skipping pin', {
					threadId: thread.id,
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
			await message.pin('Automatic pin of first support message');

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
	 * Fetches the first message from the thread owner with retry logic
	 * - Tries starter message first (forum threads)
	 * - Retries multiple times with exponential backoff
	 * - Returns early if message is found
	 * 
	 * @param thread Thread to fetch messages from
	 * @param threadOwnerId ID of the thread owner
	 * @returns First message from owner or null if not found
	 */
	private async fetchFirstOwnerMessage(thread: ThreadChannel, threadOwnerId: string) {
		// Try to fetch starter message first (more efficient for forum threads)
		if (thread.isThread() && thread.parent?.type === 15) { // 15 = GuildForum
			try {
				const starterMessage = await thread.fetchStarterMessage();
				if (starterMessage && starterMessage.author.id === threadOwnerId) {
					this.container.logger.debug('Found starter message from thread owner', {
						threadId: thread.id,
						messageId: starterMessage.id
					});
					return starterMessage;
				}
			} catch (error) {
				this.container.logger.debug('Could not fetch starter message, will try regular messages', {
					threadId: thread.id,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		// Fall back to fetching messages with retry and exponential backoff
		for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
			try {
				// Calculate delay with exponential backoff: 500ms, 1s, 2s, 4s, 5s, 5s
				const retryDelay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);

				this.container.logger.debug('Attempting to fetch messages from thread', {
					threadId: thread.id,
					attempt,
					maxAttempts: MAX_FETCH_ATTEMPTS,
					nextRetryDelayMs: attempt < MAX_FETCH_ATTEMPTS ? retryDelay : undefined
				});

				// Fetch recent messages with increased limit
				const messages = await thread.messages.fetch({ limit: 20 });

				if (messages.size > 0) {
					// Find the first message from the thread owner (oldest first)
					const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
					const message = sortedMessages.find(msg => msg.author.id === threadOwnerId);

					if (message) {
						this.container.logger.debug('Found message from thread owner', {
							threadId: thread.id,
							messageId: message.id,
							attempt
						});
						return message;
					}
				}

				// If not the last attempt, wait before retrying with exponential backoff
				if (attempt < MAX_FETCH_ATTEMPTS) {
					this.container.logger.debug('No messages found, waiting before retry', {
						threadId: thread.id,
						attempt,
						retryDelayMs: retryDelay
					});
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				}
			} catch (error) {
				const retryDelay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);

				this.container.logger.warn('Error fetching messages during retry', {
					threadId: thread.id,
					attempt,
					error: error instanceof Error ? error.message : String(error)
				});

				// If not the last attempt, wait before retrying
				if (attempt < MAX_FETCH_ATTEMPTS) {
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				}
			}
		}

		return null;
	}

	/**
	 * Deletes the automatic pin notification message
	 * - Waits for notification to be sent
	 * - Finds and deletes ChannelPinnedMessage type
	 */
	private async deletePinNotification(thread: ThreadChannel) {
		// Wait for notification to appear
		await new Promise((resolve) => setTimeout(resolve, PIN_NOTIFICATION_DELETE_DELAY_MS));

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
