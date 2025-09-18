import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { AutocompleteInteraction, ApplicationCommandOptionChoiceData } from 'discord.js';

import { normalizeTagName } from '../subcommands/support/tag';

type ResolvedAutocompleteResult = ApplicationCommandOptionChoiceData[];

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Autocomplete
})
export class SupportTagsAutocompleteHandler extends InteractionHandler {
	public override async run(interaction: AutocompleteInteraction, choices: ResolvedAutocompleteResult) {
		return interaction.respond(choices);
	}

	public override async parse(interaction: AutocompleteInteraction) {
		if (!interaction.guildId) {
			return this.some([]);
		}

		const subcommand = interaction.options.getSubcommand(false);
		if (!subcommand || !['delete', 'edit', 'use'].includes(subcommand)) {
			return this.none();
		}

		const focused = interaction.options.getFocused(true);
		if (focused.name !== 'name') {
			return this.none();
		}

		const rawQuery = typeof focused.value === 'string' ? focused.value : '';
		const query = rawQuery.trim();
		const normalizedQuery = query ? normalizeTagName(query) : '';

		try {
			const tags = await this.container.database.guildSupportTag.findMany({
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

			const results = [...startsWith, ...contains]
				.slice(0, 25)
				.map((name) => ({ name, value: name }) satisfies ApplicationCommandOptionChoiceData);

			return this.some(results);
		} catch (error) {
			this.container.logger.error('Failed to build support tag autocomplete suggestions', error);
			return this.some([]);
		}
	}
}
