// messageCommandDenied module within listeners/commands/messageCommands
import type { Events, MessageCommandDeniedPayload } from '@sapphire/framework';
import { Listener, type UserError } from '@sapphire/framework';
import { Logger } from '../../../lib/logger';

export class UserEvent extends Listener<typeof Events.MessageCommandDenied> {
	public override async run({ context, message: content }: UserError, { message, command }: MessageCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		Logger.debug('Message command denied', {
			commandName: command.name,
			guildId: message.guildId,
			channelId: message.channelId,
			userId: message.author.id,
			reason: content
		});

		try {
			return message.reply({ content, allowedMentions: { users: [message.author.id], roles: [] } });
		} catch (error) {
			Logger.error('Failed to send message command denial response', error, {
				messageId: message.id,
				channelId: message.channelId,
				userId: message.author.id
			});

			try {
				if (message.channel && 'send' in message.channel) {
					return (message.channel as Extract<typeof message.channel, { send: Function }>).send({
						content: 'There was an error sending that response.',
						allowedMentions: { users: [message.author.id], roles: [] }
					});
				}
			} catch (fallbackError) {
				Logger.error('Failed to send fallback message command denial response', fallbackError, {
					messageId: message.id,
					channelId: message.channelId,
					userId: message.author.id
				});
			}

			return;
		}
	}
}
