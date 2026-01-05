import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { REMINDER_LIST_CUSTOM_ID, REMINDER_LIST_ITEMS_PER_PAGE } from './constants.js';
import type { ReminderCommand } from './utils.js';
import { buildReminderListComponent } from './reminder-list.js';

// Handle message command: !reminders list
export async function messageReminderList(this: ReminderCommand, message: Message, _args: Args) {
	try {
		const reminders = await this.container.database.reminder.findMany({
			where: {
				userId: message.author.id
			},
			orderBy: {
				remindAt: 'asc'
			}
		});

		if (reminders.length === 0) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('📭 You have no active reminders.'));

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			});
		}

		// Import components dynamically
		const { createPaginationButtons } = await import('../../lib/components.js');

		// Create paginated view
		const currentPage = 1;
		const totalPages = Math.ceil(reminders.length / REMINDER_LIST_ITEMS_PER_PAGE);

		// Get reminders for first page
		const startIndex = 0;
		const endIndex = Math.min(REMINDER_LIST_ITEMS_PER_PAGE, reminders.length);
		const pageReminders = reminders.slice(startIndex, endIndex);

		const container = buildReminderListComponent(pageReminders, reminders.length, currentPage, totalPages);

		// Create navigation buttons with ownerId to restrict access
		const buttons = createPaginationButtons(currentPage, totalPages, REMINDER_LIST_CUSTOM_ID, {
			ownerId: message.author.id
		});

		const components = buttons.length > 0 ? [container, ...buttons] : [container];

		return message.reply({
			components,
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	} catch (error) {
		this.container.logger.error('Error listing reminders:', error);

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ An error occurred while listing reminders.'));

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}
}
