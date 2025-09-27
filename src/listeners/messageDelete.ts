import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Message, PartialMessage } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageDelete })
export class MessageDeleteListener extends Listener<typeof Events.MessageDelete> {
	public override async run(message: Message | PartialMessage) {
		// Skip if message is not in a guild
		if (!message.guildId) return;

		try {
			await this.container.snipeManager.handleMessageDelete(message);
		} catch (error) {
			this.container.logger.error('Snipe manager message delete handler failed', error, {
				guildId: message.guildId,
				channelId: message.channelId,
				messageId: message.id
			});
		}
	}
}