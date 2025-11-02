// tagautocomplete module within interaction-handlers
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction } from 'discord.js';

import { ensureAllowedTagRoleAccess, ensureSupportRoleAccess, ensureTagChannelAccess, normalizeTagName } from '../subcommands/support/tag/utils';

const HANDLED_SUBCOMMANDS = new Set(['delete', 'edit', 'use']);

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Autocomplete
})
export class SupportTagsAutocompleteHandler extends InteractionHandler {
	public override async run(interaction: AutocompleteInteraction, choices: ApplicationCommandOptionChoiceData[]) {
		return interaction.respond(choices);
	}

	public override async parse(interaction: AutocompleteInteraction) {
		if (!interaction.guildId) {
			return this.some([]);
		}

		const subcommand = interaction.options.getSubcommand(false);
		if (!subcommand || !HANDLED_SUBCOMMANDS.has(subcommand)) {
			return this.none();
		}

		const focused = interaction.options.getFocused(true);
		if (focused.name !== 'name') {
			return this.none();
		}

		const supportAccess = await ensureSupportRoleAccess(this, interaction);
		if (!supportAccess.allowed) {
			return this.some([]);
		}

		if (subcommand === 'use') {
			const allowedTagRoleAccess = await ensureAllowedTagRoleAccess(this, interaction);
			if (!allowedTagRoleAccess.allowed) {
				return this.some([]);
			}
		}

		const channelAccess = await ensureTagChannelAccess(this, interaction);
		if (!channelAccess.allowed) {
			return this.some([]);
		}

		const rawQuery = typeof focused.value === 'string' ? focused.value : '';
		const query = rawQuery.trim();
		const normalizedQuery = query ? normalizeTagName(query) : '';

		const service = this.container.supportTagService;
		if (!service) {
			this.container.logger.error('Support tag service is not initialised');
			return this.some([]);
		}

		try {
			const tags = await service.listTags(interaction.guildId);

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

			return this.some(choices);
		} catch (error) {
			this.container.logger.error('Failed to resolve support tag autocomplete suggestions', error);
			return this.some([]);
		}
	}
}
