// topicsautocomplete module within interaction-handlers
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction } from 'discord.js';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Autocomplete
})
export class TopicsAutocompleteHandler extends InteractionHandler {
	public override async run(interaction: AutocompleteInteraction, choices: ApplicationCommandOptionChoiceData[]) {
		return interaction.respond(choices);
	}

	public override async parse(interaction: AutocompleteInteraction) {
		if (!interaction.guildId) {
			return this.some([]);
		}

		// Check if this is the topics remove command
		const commandName = interaction.commandName;
		const subcommandGroup = interaction.options.getSubcommandGroup(false);
		const subcommand = interaction.options.getSubcommand(false);

		if (commandName !== 'settings' || subcommandGroup !== 'topics' || subcommand !== 'remove') {
			return this.none();
		}

		const focused = interaction.options.getFocused(true);
		if (focused.name !== 'topic') {
			return this.none();
		}

		const rawQuery = typeof focused.value === 'string' ? focused.value : '';
		const query = rawQuery.trim().toLowerCase();

		const service = this.container.guildTopicSettingsService;
		if (!service) {
			this.container.logger.error('Topic settings service is not available');
			return this.some([]);
		}

		try {
			const topics = await service.listTopics(interaction.guildId);

			if (topics.length === 0) {
				return this.some([{ name: 'No topics configured', value: '' }]);
			}

			const startsWith: { name: string; value: string }[] = [];
			const contains: { name: string; value: string }[] = [];

			for (let i = 0; i < topics.length; i++) {
				const topic = topics[i];
				const topicLower = topic.value.toLowerCase();

				// Create a display name with position and database ID for easier identification
				const position = i + 1;
				const displayName = `${position}. ${topic.value} (ID: #${topic.id})`;
				const choiceData = { name: displayName, value: topic.value };

				if (!query) {
					contains.push(choiceData);
					continue;
				}

				if (topicLower.startsWith(query)) {
					startsWith.push(choiceData);
				} else if (topicLower.includes(query)) {
					contains.push(choiceData);
				}
			}

			// Prioritize startsWith matches, then contains matches
			const choices = [...startsWith, ...contains]
				.slice(0, 25); // Discord limit is 25 choices

			return this.some(choices);
		} catch (error) {
			this.container.logger.error('Failed to resolve topics autocomplete suggestions', error);
			return this.some([]);
		}
	}
}