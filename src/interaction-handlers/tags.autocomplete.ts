import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { AutocompleteInteraction, ApplicationCommandOptionChoiceData } from 'discord.js';

import { resolveSupportTagAutocomplete } from '../subcommands/support/tag';

type ResolvedAutocompleteResult = ApplicationCommandOptionChoiceData[];

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Autocomplete
})
export class SupportTagsAutocompleteHandler extends InteractionHandler {
	public override async run(interaction: AutocompleteInteraction, choices: ResolvedAutocompleteResult) {
		return interaction.respond(choices);
	}

	public override async parse(interaction: AutocompleteInteraction) {
		const result = await resolveSupportTagAutocomplete(this, interaction);
		if (!result.handled) {
			return this.none();
		}

		return this.some(result.choices);
	}
}
