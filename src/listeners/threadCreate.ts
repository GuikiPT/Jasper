import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ThreadChannel, MessageType } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.ThreadCreate, once: false })
export class UserEvent extends Listener {
	public override async run(thread: ThreadChannel, newlyCreated: boolean) {
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

		// if the newlyCreated flag is true, fetch first thread message
		if (newlyCreated) {
			try {
				// For support threads, we want to pin the first message from the thread creator
				const message = await thread.messages.fetch(thread.id);

				// Verify this is actually the first message from the thread owner
				const threadOwnerId = thread.ownerId || (await this.resolveThreadOwnerId(thread));
				if (!threadOwnerId) {
					this.container.logger.debug('Could not determine thread owner, skipping pin logic', {
						threadId: thread.id
					});
					return;
				}

				// Only pin if the first message is from the thread owner (the support request)
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

				// Wait a short time for the pin notification to be sent, then delete it
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
				}, 1000); // Adjust timeout if needed
			} catch (error) {
				this.container.logger.error('Failed to fetch or pin first message in support thread', error, {
					threadId: thread.id,
					guildId: thread.guildId
				});
			}
		}
	}

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
