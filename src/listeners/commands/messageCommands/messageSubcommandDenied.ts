// messageSubcommandDenied module within listeners/commands/messageCommands
import { Listener, type UserError } from '@sapphire/framework';
import type { MessageSubcommandDeniedPayload } from '@sapphire/plugin-subcommands';
import { SubcommandPluginEvents } from '@sapphire/plugin-subcommands';

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

		return message.reply({ content, allowedMentions: { users: [message.author.id], roles: [] } });
	}
}
