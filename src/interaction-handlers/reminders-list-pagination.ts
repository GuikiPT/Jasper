// Reminder list pagination handler - handles page navigation for reminder list display
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags, ContainerBuilder } from 'discord.js';
import {
	REMINDER_LIST_CUSTOM_ID,
	REMINDER_LIST_ITEMS_PER_PAGE,
	buildReminderListComponent
} from '../subcommands/reminders/reminder-index.js';
import { TextDisplayBuilder } from 'discord.js';

// Parsed pagination metadata from button custom ID
interface PaginationMetadata {
	ownerId: string;
	targetPage: number;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ReminderListPaginationHandler extends InteractionHandler {
	// Parse button custom ID and extract pagination metadata
	public override parse(interaction: ButtonInteraction) {
		try {
			// Expected format: reminders:list:ownerId:action:page (5 segments)
			const segments = interaction.customId.split(':');

			// Should be: reminders:list:ownerId:action:page (5 segments)
			if (segments.length !== 5) {
				return this.none();
			}

			const [base, subcommand, ownerId, action, rawPage] = segments;

			// Validate custom ID prefix
			if (`${base}:${subcommand}` !== REMINDER_LIST_CUSTOM_ID) {
				return this.none();
			}

			// Validate action type
			if (action !== 'prev' && action !== 'next' && action !== 'page') {
				return this.none();
			}

			// Parse target page number
			const targetPage = Number.parseInt(rawPage, 10);
			if (!Number.isFinite(targetPage)) {
				return this.none();
			}

			// Check if the user clicking the button is the owner
			if (interaction.user.id !== ownerId) {
				return this.none();
			}

			return this.some<PaginationMetadata>({ ownerId, targetPage: Math.max(1, targetPage) });
		} catch (error) {
			this.container.logger.error('Failed to parse reminder list pagination interaction', error, {
				userId: interaction.user.id,
				customId: interaction.customId
			});
			return this.none();
		}
	}

	// Handle pagination button click
	public override async run(interaction: ButtonInteraction, data: PaginationMetadata) {
		try {
			// Fetch all reminders for user
			const reminders = await this.container.database.reminder.findMany({
				where: {
					userId: data.ownerId
				},
				orderBy: {
					remindAt: 'asc'
				}
			});

			if (reminders.length === 0) {
				const container = new ContainerBuilder();
				container.addTextDisplayComponents(new TextDisplayBuilder().setContent('📭 You have no active reminders.'));

				return interaction.update({
					components: [container],
					flags: MessageFlags.IsComponentsV2
				});
			}

			const requestedPage = data.targetPage;
			const totalPages = Math.ceil(reminders.length / REMINDER_LIST_ITEMS_PER_PAGE);
			const currentPage = Math.max(1, Math.min(requestedPage, totalPages));

			// Get reminders for current page
			const startIndex = (currentPage - 1) * REMINDER_LIST_ITEMS_PER_PAGE;
			const endIndex = Math.min(startIndex + REMINDER_LIST_ITEMS_PER_PAGE, reminders.length);
			const pageReminders = reminders.slice(startIndex, endIndex);

			// Import components dynamically
			const { createPaginationButtons } = await import('../lib/components.js');

			// Build container for this page
			const container = buildReminderListComponent(pageReminders, reminders.length, currentPage, totalPages);

			// Create navigation buttons for new page with ownerId to maintain access control
			const buttons = createPaginationButtons(currentPage, totalPages, REMINDER_LIST_CUSTOM_ID, {
				ownerId: data.ownerId
			});

			const components = buttons.length > 0 ? [container, ...buttons] : [container];

			// Update message with new page
			return interaction.update({
				components,
				flags: MessageFlags.IsComponentsV2
			});
		} catch (error) {
			this.container.logger.error('Failed to process reminder list pagination interaction', error, {
				userId: interaction.user.id,
				customId: interaction.customId
			});

			const container = new ContainerBuilder();
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent("❌ I couldn't update the reminder list. Please try again shortly.")
			);

			return interaction.reply({
				components: [container],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}
	}
}
