import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class AutomaticSlowmodeListener extends Listener<typeof Events.MessageCreate> {
	public override async run(message: Message) {
		if (message.author.bot) return;
		if (!message.guildId) return;
		if (!message.channel) return;

		try {
			await this.container.slowmodeManager.handleMessage(message);
		} catch (error) {
			this.container.logger.error('Automatic slowmode handler failed', error, {
				guildId: message.guildId,
				channelId: message.channel.id
			});
		}
	}
}
