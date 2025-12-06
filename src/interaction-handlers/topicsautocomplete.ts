// Topics autocomplete handler - provides topic suggestions for remove subcommand
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction } from 'discord.js';

@ApplyOptions<InteractionHandler.Options>({
    interactionHandlerType: InteractionHandlerTypes.Autocomplete
})
export class TopicsAutocompleteHandler extends InteractionHandler {
    // Send autocomplete choices to Discord
    public override async run(interaction: AutocompleteInteraction, choices: ApplicationCommandOptionChoiceData[]) {
        return interaction.respond(choices);
    }

    // Parse interaction and generate topic suggestions
    public override async parse(interaction: AutocompleteInteraction) {
        // Require guild context
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

        // Check if the focused option is the topic field
        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'topic') {
            return this.none();
        }

        // Extract and normalize search query
        const rawQuery = typeof focused.value === 'string' ? focused.value : '';
        const query = rawQuery.trim().toLowerCase();

        // Get topic settings service
        const service = this.container.guildTopicSettingsService;
        if (!service) {
            this.container.logger.error('Topic settings service is not available');
            return this.some([]);
        }

        try {
            // Fetch all topics for guild
            const topics = await service.listTopics(interaction.guildId);

            if (topics.length === 0) {
                return this.some([{ name: 'No topics configured', value: '' }]);
            }

            // Sort topics by relevance: startsWith > contains
            const startsWith: { name: string; value: string }[] = [];
            const contains: { name: string; value: string }[] = [];

            for (let i = 0; i < topics.length; i++) {
                const topic = topics[i];
                const topicLower = topic.value.toLowerCase();

                // Create display name with position and ID for easier identification
                const position = i + 1;
                const displayName = `${position}. ${topic.value} (ID: #${topic.id})`;
                const choiceData = { name: displayName, value: topic.value };

                // If no query, include all topics
                if (!query) {
                    contains.push(choiceData);
                    continue;
                }

                // Prioritize exact prefix matches
                if (topicLower.startsWith(query)) {
                    startsWith.push(choiceData);
                } else if (topicLower.includes(query)) {
                    contains.push(choiceData);
                }
            }

            // Build choices list (max 25 for Discord limit)
            const choices = [...startsWith, ...contains].slice(0, 25);

            return this.some(choices);
        } catch (error) {
            this.container.logger.error('Failed to resolve topics autocomplete suggestions', error);
            return this.some([]);
        }
    }
}
