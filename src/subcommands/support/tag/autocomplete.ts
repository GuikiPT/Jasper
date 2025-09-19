import type {
	ApplicationCommandOptionChoiceData,
	AutocompleteInteraction
} from 'discord.js';

import {
	ensureAllowedTagRoleAccess,
	ensureSupportRoleAccess,
	ensureTagChannelAccess,
	normalizeTagName
} from './utils';
import type { TagCommand } from './utils';

const HANDLED_SUBCOMMANDS = new Set(['delete', 'edit', 'use']);

type ContainerAccessor = { container: TagCommand['container'] };

type AutocompleteResolution =
	| { handled: true; choices: ApplicationCommandOptionChoiceData[] }
	| { handled: false };

export const resolveSupportTagAutocomplete = async (
	context: ContainerAccessor,
	interaction: AutocompleteInteraction
): Promise<AutocompleteResolution> => {
	if (!interaction.guildId) {
		return { handled: true, choices: [] };
	}

	const subcommand = interaction.options.getSubcommand(false);
	if (!subcommand || !HANDLED_SUBCOMMANDS.has(subcommand)) {
		return { handled: false };
	}

	const focused = interaction.options.getFocused(true);
	if (focused.name !== 'name') {
		return { handled: false };
	}

	const supportAccess = await ensureSupportRoleAccess(context, interaction);
	if (!supportAccess.allowed) {
		return { handled: true, choices: [] };
	}

	if (subcommand === 'use') {
		const allowedTagRoleAccess = await ensureAllowedTagRoleAccess(context, interaction);
		if (!allowedTagRoleAccess.allowed) {
			return { handled: true, choices: [] };
		}
	}

	const channelAccess = await ensureTagChannelAccess(context, interaction);
	if (!channelAccess.allowed) {
		return { handled: true, choices: [] };
	}

	const rawQuery = typeof focused.value === 'string' ? focused.value : '';
	const query = rawQuery.trim();
	const normalizedQuery = query ? normalizeTagName(query) : '';

	try {
		const tags = await context.container.database.guildSupportTag.findMany({
			where: { guildId: interaction.guildId },
			select: { name: true },
			orderBy: { name: 'asc' }
		});

		const startsWith: string[] = [];
		const contains: string[] = [];
		for (const { name } of tags) {
			if (!normalizedQuery) {
				contains.push(name);
				continue;
			}

			if (name.startsWith(normalizedQuery)) {
				startsWith.push(name);
			} else if (name.includes(normalizedQuery)) {
				contains.push(name);
			}
		}

		const choices = [...startsWith, ...contains]
			.slice(0, 25)
			.map((name) => ({ name, value: name }) satisfies ApplicationCommandOptionChoiceData);

		return { handled: true, choices };
	} catch (error) {
		context.container.logger.error('Failed to resolve support tag autocomplete suggestions', error);
		return { handled: true, choices: [] };
	}
};
