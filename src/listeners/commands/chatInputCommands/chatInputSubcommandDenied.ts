// chatInputSubcommandDenied module within listeners/commands/chatInputCommands
import { Listener, UserError } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import type { ChatInputSubcommandDeniedPayload } from '@sapphire/plugin-subcommands';
import { SubcommandPluginEvents } from '@sapphire/plugin-subcommands';
import { createErrorTextComponent } from '../../../lib/components';
import { Logger } from '../../../lib/logger';

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

		Logger.debug('Chat input subcommand denied', {
			commandName: interaction.commandName,
			guildId: interaction.guildId,
			channelId: interaction.channelId ?? null,
			userId: interaction.user.id,
			reason: content
		});

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
			Logger.error('Failed to send chat input subcommand denial response', error, {
				commandName: interaction.commandName,
				userId: interaction.user.id,
				deferred: interaction.deferred,
				replied: interaction.replied
			});

			try {
				const fallbackContent = 'There was an error sending the denial response for this subcommand.';
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
				Logger.error('Failed to send fallback chat input subcommand denial response', fallbackError, {
					commandName: interaction.commandName,
					userId: interaction.user.id
				});
			}

			return;
		}
	}
}
