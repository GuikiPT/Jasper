// messageSubcommandDenied module within listeners/commands/messageCommands
import { Listener, type UserError } from '@sapphire/framework';
import type { MessageSubcommandDeniedPayload } from '@sapphire/plugin-subcommands';
import { SubcommandPluginEvents } from '@sapphire/plugin-subcommands';
import { Logger } from '../../../lib/logger';

export class UserEvent extends Listener<typeof SubcommandPluginEvents.MessageSubcommandDenied> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			event: SubcommandPluginEvents.MessageSubcommandDenied
		});
	}

	public override async run({ context, message: content }: UserError, { message }: MessageSubcommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		try {
			return message.reply({ content, allowedMentions: { users: [message.author.id], roles: [] } });
		} catch (error) {
			Logger.error('Failed to send message subcommand denial response', error, {
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
				Logger.error('Failed to send fallback message subcommand denial response', fallbackError, {
					messageId: message.id,
					channelId: message.channelId,
					userId: message.author.id
				});
			}

			return;
		}
	}
}
