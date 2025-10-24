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

		// if the newlyCreated flag is true, fetch first thread message
		if (newlyCreated) {
			try {
				const message = await thread.messages.fetch(thread.id);

				this.container.logger.debug('First message in the thread', {
					id: message.id,
					channelId: message.channelId,
					guildId: message.guildId,
					authorId: message.author?.id,
					content: message.content
				});

				// Pin the first message
				await message.pin();
				this.container.logger.debug('Successfully pinned the first message in the thread', {
					threadId: thread.id,
					messageId: message.id
				});

				// Wait a short time for the pin notification to be sent, then delete it
				setTimeout(async () => {
					try {
						const messages = await thread.messages.fetch({ limit: 5 });
						const notification = messages.find(m => m.type === MessageType.ChannelPinnedMessage);
						if (notification) {
							await notification.delete();
							this.container.logger.debug('Deleted pin notification message', {
								threadId: thread.id,
								notificationId: notification.id
							});
						}
					} catch (error) {
						this.container.logger.error('Failed to delete pin notification', error, {
							threadId: thread.id,
							guildId: thread.guildId
						});
					}
				}, 1000); // Adjust timeout if needed
			} catch (error) {
				this.container.logger.error('Failed to fetch or pin first message in the thread', error, {
					threadId: thread.id,
					guildId: thread.guildId
				});
			}
		}
	}
}
