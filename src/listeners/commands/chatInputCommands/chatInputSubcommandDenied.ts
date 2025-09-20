import { Listener, UserError } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import type { ChatInputSubcommandDeniedPayload } from '@sapphire/plugin-subcommands';
import { SubcommandPluginEvents } from '@sapphire/plugin-subcommands';
import { createErrorTextComponent } from '../../../lib/components';

export class UserEvent extends Listener<typeof SubcommandPluginEvents.ChatInputSubcommandDenied> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			event: SubcommandPluginEvents.ChatInputSubcommandDenied
		});
	}

	public override async run({ context, message: content }: UserError, { interaction }: ChatInputSubcommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		// Create component-based response for better UX
		const component = createErrorTextComponent(content);

		if (interaction.deferred || interaction.replied) {
			return interaction.editReply({
				components: [component],
				allowedMentions: { users: [interaction.user.id], roles: [] },
				flags: MessageFlags.IsComponentsV2
			});
		}

		return interaction.reply({
			components: [component],
			allowedMentions: { users: [interaction.user.id], roles: [] },
			flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		});
	}
}