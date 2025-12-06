// Message delete listener - Tracks deleted messages for snipe functionality
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Message, PartialMessage } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageDelete })
export class MessageDeleteListener extends Listener<typeof Events.MessageDelete> {
	/**
	 * Handles message deletion events
	 * - Stores deleted message data for snipe command
	 * - Only processes guild messages (ignores DMs)
	 */
	public override async run(message: Message | PartialMessage) {
		try {
			// Skip DM messages
			if (!message.guildId) return;

			try {
				// Store deleted message for snipe functionality
				await this.container.snipeManager.handleMessageDelete(message);
			} catch (error) {
				this.container.logger.error('Snipe manager message delete handler failed', error, {
					guildId: message.guildId,
					channelId: message.channelId,
					messageId: message.id
				});
			}
		} catch (error) {
			this.container.logger.error('Unhandled error in messageDelete listener', error, {
				guildId: message.guildId,
				channelId: message.channelId,
				messageId: message.id
			});
		}
	}
}
