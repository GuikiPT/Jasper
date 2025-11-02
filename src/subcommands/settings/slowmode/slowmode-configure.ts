// slowmode-configure module within subcommands/settings/slowmode
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	executeSlowmodeUpdate,
	denyInteraction,
	deferInteraction,
	parseMessageConfigureArgs,
	type SlowmodeChatInputInteraction,
	type SlowmodeCommand,
	type SlowmodeUpdateInput
} from './utils';

export async function messageSlowmodeConfigure(command: SlowmodeCommand, message: Message, args: Args) {
	const updates = await parseMessageConfigureArgs(args);

	if (Object.keys(updates).length === 0) {
		return message.reply(
			'Provide slowmode updates as space-separated `key=value` pairs. Example: `threshold=12 window=45 cooldown=30 enabled=true`.'
		);
	}

	return executeSlowmodeUpdate({
		command,
		guildId: message.guildId ?? null,
		updates,
		respond: (content) => message.reply({ content }),
		deny: (content) => message.reply({ content })
	});
}

export async function chatInputSlowmodeConfigure(command: SlowmodeCommand, interaction: SlowmodeChatInputInteraction) {
	const updates: SlowmodeUpdateInput = {};

	const enabled = interaction.options.getBoolean('enabled');
	if (enabled !== null) updates.enabled = enabled;

	const threshold = interaction.options.getInteger('threshold');
	if (threshold !== null) updates.messageThreshold = threshold;

	const window = interaction.options.getInteger('window');
	if (window !== null) updates.messageTimeWindow = window;

	const cooldown = interaction.options.getInteger('cooldown');
	if (cooldown !== null) updates.cooldownDuration = cooldown;

	const reset = interaction.options.getInteger('reset');
	if (reset !== null) updates.resetTime = reset;

	const max = interaction.options.getInteger('max');
	if (max !== null) updates.maxSlowmode = max;

	if (Object.keys(updates).length === 0) {
		return denyInteraction(interaction, 'Select at least one option to update.');
	}

	return executeSlowmodeUpdate({
		command,
		guildId: interaction.guildId ?? null,
		updates,
		respond: (content) => interaction.editReply({ content, allowedMentions: { users: [], roles: [] } }),
		respondComponents: (components) =>
			interaction.editReply({
				components,
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			}),
		deny: (content) => denyInteraction(interaction, content),
		defer: () => deferInteraction(interaction)
	});
}
