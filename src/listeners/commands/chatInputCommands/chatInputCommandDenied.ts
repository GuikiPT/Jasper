// chatInputCommandDenied module within listeners/commands/chatInputCommands
import type { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { createErrorTextComponent } from '../../../lib/components';
import { Logger } from '../../../lib/logger';

export class UserEvent extends Listener<typeof Events.ChatInputCommandDenied> {
	public override async run({ context, message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		const component = createErrorTextComponent(content);

		try {
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
		} catch (error) {
			Logger.error('Failed to send chat input command denial response', error, {
				commandName: interaction.commandName,
				userId: interaction.user.id,
				deferred: interaction.deferred,
				replied: interaction.replied
			});

			try {
				const fallbackContent = 'There was an error sending the denial response.';
				if (interaction.deferred || interaction.replied) {
					return interaction.editReply({
						content: fallbackContent,
						components: [],
						allowedMentions: { users: [interaction.user.id], roles: [] }
					});
				}

				return interaction.reply({
					content: fallbackContent,
					ephemeral: true,
					allowedMentions: { users: [interaction.user.id], roles: [] }
				});
			} catch (fallbackError) {
				Logger.error('Failed to send fallback chat input command denial response', fallbackError, {
					commandName: interaction.commandName,
					userId: interaction.user.id
				});
			}
		}
	}
}
