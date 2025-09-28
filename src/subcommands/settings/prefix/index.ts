// index module within subcommands/settings/prefix
import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';
import type { SlashCommandSubcommandGroupBuilder } from 'discord.js';

import { chatInputPrefixSet, messagePrefixSet } from './prefix-set';
import { chatInputPrefixView, messagePrefixView } from './prefix-view';

export { chatInputPrefixSet, chatInputPrefixView, messagePrefixSet, messagePrefixView };

export const prefixSubcommandMapping: SubcommandMappingGroup = {
	name: 'prefixes',
	type: 'group',
	entries: [
		{
			name: 'set',
			chatInputRun: 'chatInputPrefixSet',
			messageRun: 'messagePrefixSet',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'view',
			chatInputRun: 'chatInputPrefixView',
			messageRun: 'messagePrefixView',
			default: true,
			preconditions: ['AllowedAdminRoles']
		}
	]
};

export const registerPrefixSubcommandGroup = (group: SlashCommandSubcommandGroupBuilder) =>
	group
		.setName('prefixes')
		.setDescription('View or update the prefix used for message commands.')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('set')
				.setDescription('Set a new prefix for this server.')
				.addStringOption((option) =>
					option
						.setName('value')
						.setDescription('New prefix to save.')
						.setRequired(true)
						.setMaxLength(16)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand.setName('view').setDescription('View the current prefix for this server.'));
