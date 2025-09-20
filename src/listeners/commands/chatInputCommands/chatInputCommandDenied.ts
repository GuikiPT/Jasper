import type { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { createErrorTextComponent } from '../../../lib/components';

export class UserEvent extends Listener<typeof Events.ChatInputCommandDenied> {
	public override async run({ context, message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
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
