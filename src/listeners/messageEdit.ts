import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, PartialMessage } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageUpdate, once: false })
export class UserEvent extends Listener {
	public override async run(message: Message | PartialMessage) {
		if (message.partial) {
			try {
				await message.fetch();
			} catch (error) {
				this.container.logger.error('Failed to fetch partial message on message edit', error, {
					messageId: message.id,
					channelId: message.channelId,
					guildId: message.guildId
				});
				return;
			}
		}

		console.log('Message edited:\n', JSON.stringify({
			id: message.id,
			channelId: message.channelId,
			guildId: message.guildId,
			authorId: message.author?.id,
			content: message.content
		}, null, 2));

	}
}
