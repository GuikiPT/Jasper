import type { Args } from '@sapphire/framework';
import type { Message, Role } from 'discord.js';
import { MessageFlags } from 'discord.js';

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
			deny: (content) => message.reply(content),
			respond: (content) => message.reply(content)
		});
	} catch (error) {
		return message.reply(formatError(error));
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
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}
