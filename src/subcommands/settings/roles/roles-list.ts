// roles-list module within subcommands/settings/roles
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { createErrorTextComponent, createTextComponent } from '../../../lib/components.js';

import {
	executeRoleList,
	formatError,
	parseBucket,
	parseBucketChoice,
	ROLE_BUCKETS,
	type RoleChatInputInteraction,
	type RoleCommand,
	denyInteraction
} from './utils';

export async function messageRoleList(command: RoleCommand, message: Message, args: Args) {
	try {
		const bucket = await parseBucket(args, false);
		return executeRoleList({
			command,
			guildId: message.guildId ?? null,
			bucket,
			deny: (content) =>
				message.reply({
					components: [createErrorTextComponent(content)],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				}),
			respond: (content) =>
				message.reply({
					components: [createTextComponent(content)],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				}),
			respondComponents: (components) => message.reply({
				components,
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			})
		});
	} catch (error) {
		return message.reply({
			components: [createErrorTextComponent(formatError(error))],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}
}

export async function chatInputRoleList(command: RoleCommand, interaction: RoleChatInputInteraction) {
	// If the user doesn't pick a specific setting, show all buckets.
	const selected = interaction.options.getString('setting');
	const bucket = selected ? parseBucketChoice(selected, ROLE_BUCKETS[0].key) : null;

	return executeRoleList({
		command,
		guildId: interaction.guildId ?? null,
		bucket,
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) => interaction.editReply({
			components: [createTextComponent(content)],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		}),
		respondComponents: (components) => interaction.editReply({
			components,
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		}),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
