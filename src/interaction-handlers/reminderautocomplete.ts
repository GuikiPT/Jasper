// Reminder autocomplete handler - provides reminder suggestions for delete and edit subcommands
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction } from 'discord.js';
import { formatReminderForAutocomplete } from '../lib/reminderUtils';

// Subcommands that require reminder ID autocomplete
const HANDLED_SUBCOMMANDS = new Set(['delete', 'edit']);

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Autocomplete
})
export class ReminderAutocompleteHandler extends InteractionHandler {
	// Send autocomplete choices to Discord
	public override async run(interaction: AutocompleteInteraction, choices: ApplicationCommandOptionChoiceData[]) {
		try {
			return await interaction.respond(choices);
		} catch (error) {
			this.container.logger.error('Failed to respond to reminder autocomplete interaction', error, {
				userId: interaction.user.id
			});
			return interaction.respond([]);
		}
	}

	// Parse interaction and generate reminder suggestions
	public override async parse(interaction: AutocompleteInteraction) {
		try {
			// Check if this is the reminders command
			if (interaction.commandName !== 'reminders') {
				return this.none();
			}

			// Check if this is a handled subcommand
			const subcommand = interaction.options.getSubcommand(false);
			if (!subcommand || !HANDLED_SUBCOMMANDS.has(subcommand)) {
				return this.none();
			}

			// Check if the focused option is the id field
			const focused = interaction.options.getFocused(true);
			if (focused.name !== 'id') {
				return this.none();
			}

			// Fetch user's reminders
			const reminders = await this.container.database.reminder.findMany({
				where: {
					userId: interaction.user.id
				},
				orderBy: {
					remindAt: 'asc'
				},
				take: 25 // Discord's limit for autocomplete
			});

			if (reminders.length === 0) {
				return this.some([
					{
						name: 'No reminders found',
						value: 'none'
					}
				]);
			}

			// Filter reminders based on user input
			const query = focused.value.toLowerCase();
			const filtered = reminders.filter((reminder) => {
				const display = formatReminderForAutocomplete(reminder.uuid, reminder.message).toLowerCase();
				return display.includes(query) || reminder.uuid.toLowerCase().includes(query);
			});

			// Create autocomplete choices
			const choices: ApplicationCommandOptionChoiceData[] = filtered.slice(0, 25).map((reminder) => ({
				name: formatReminderForAutocomplete(reminder.uuid, reminder.message),
				value: reminder.uuid
			}));

			// If no matches, show first few reminders
			if (choices.length === 0 && reminders.length > 0) {
				return this.some(
					reminders.slice(0, 25).map((reminder) => ({
						name: formatReminderForAutocomplete(reminder.uuid, reminder.message),
						value: reminder.uuid
					}))
				);
			}

			return this.some(choices);
		} catch (error) {
			this.container.logger.error('Failed to parse reminder autocomplete interaction', error, {
				userId: interaction.user.id
			});
			return this.some([]);
		}
	}
}
