// roles-remove module within subcommands/settings/roles
import type { Args } from '@sapphire/framework';
import type { Message, Role } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { createErrorTextComponent, createTextComponent } from '../../../lib/components.js';

import {
	executeRoleMutation,
	formatError,
	parseBucket,
	parseRoleId,
	type RoleBucketKey,
	type RoleChatInputInteraction,
	type RoleCommand,
	denyInteraction
} from './utils';

export async function messageRoleRemove(command: RoleCommand, message: Message, args: Args) {
	try {
		const bucket = (await parseBucket(args, true)) as RoleBucketKey;

		// Try to parse role from arguments
		let roleId: string;
		const roleResult = await args.pickResult('role');

		if (roleResult.isOk()) {
			// Successfully parsed role object
			const role = roleResult.unwrap();
			roleId = role.id;
		} else {
			// Failed to parse role - try to extract role ID from string
			const roleString = await args.pick('string');
			const parsed = parseRoleId(roleString);

			if (!parsed) {
				return message.reply({
					components: [createErrorTextComponent('Invalid role reference. Please provide a role mention or role ID.')],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				});
			}

			roleId = parsed;
		}

		return executeRoleMutation({
			command,
			guildId: message.guildId ?? null,
			bucket,
			roleId,
			operation: 'remove',
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

export async function chatInputRoleRemove(command: RoleCommand, interaction: RoleChatInputInteraction) {
	const bucket = interaction.options.getString('setting', true) as RoleBucketKey;

	// Get role - either from role picker or role_id string
	const role = interaction.options.getRole('role');
	const roleIdString = interaction.options.getString('role_id');

	// Validate that at least one role identifier is provided
	if (!role && !roleIdString) {
		return denyInteraction(interaction, 'You must provide either a role or a role ID/mention.');
	}

	// If both are provided, prefer the role picker
	if (role && roleIdString) {
		return denyInteraction(interaction, 'Please provide either a role OR a role ID, not both.');
	}

	let roleId: string;

	// Extract role ID
	if (role) {
		roleId = role.id;
	} else {
		// Parse role ID from string (ID or mention)
		const parsed = parseRoleId(roleIdString!);
		if (!parsed) {
			return denyInteraction(interaction, 'Invalid role ID or mention. Please provide a valid role ID or mention (<@&123456789>).');
		}
		roleId = parsed;
	}

	return executeRoleMutation({
		command,
		guildId: interaction.guildId ?? null,
		bucket,
		roleId,
		operation: 'remove',
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
