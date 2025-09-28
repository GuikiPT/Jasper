// roles-add module within subcommands/settings/roles
import type { Args } from '@sapphire/framework';
import type { Message, Role } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { createErrorTextComponent, createTextComponent } from '../../../lib/components.js';

import {
	executeRoleMutation,
	formatError,
	parseBucket,
	type RoleBucketKey,
	type RoleChatInputInteraction,
	type RoleCommand,
	denyInteraction
} from './utils';

export async function messageRoleAdd(command: RoleCommand, message: Message, args: Args) {
	try {
		const bucket = (await parseBucket(args, true)) as RoleBucketKey;
		const role = await args.pick('role');

		return executeRoleMutation({
			command,
			guildId: message.guildId ?? null,
			bucket,
			roleId: role.id,
			operation: 'add',
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
			respondComponents: (components) =>
				message.reply({
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

export async function chatInputRoleAdd(command: RoleCommand, interaction: RoleChatInputInteraction) {
	const bucket = interaction.options.getString('setting', true) as RoleBucketKey;
	const role = interaction.options.getRole('role', true) as Role;

	return executeRoleMutation({
		command,
		guildId: interaction.guildId ?? null,
		bucket,
		roleId: role.id,
		operation: 'add',
		deny: (content) => denyInteraction(interaction, content),
		respond: (content) =>
			interaction.editReply({
				components: [createTextComponent(content)],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			}),
		respondComponents: (components) =>
			interaction.editReply({
				components,
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			}),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
