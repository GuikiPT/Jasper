import { MessageFlags, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import type { Reminder } from '@prisma/client';
import { REMINDER_LIST_CUSTOM_ID, REMINDER_LIST_ITEMS_PER_PAGE } from './constants.js';
import type { ReminderCommand, ReminderChatInputInteraction } from './utils.js';
import { replyEphemeral } from './utils.js';

export async function chatInputReminderList(this: ReminderCommand, interaction: ReminderChatInputInteraction) {
	try {
		const reminders = await this.container.database.reminder.findMany({
			where: {
				userId: interaction.user.id
			},
			orderBy: {
				remindAt: 'asc'
			}
		});

		if (reminders.length === 0) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('📭 You have no active reminders.'));

			return replyEphemeral(interaction, [container]);
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
			ownerId: interaction.user.id
		});

		const components = buttons.length > 0 ? [container, ...buttons] : [container];

		return interaction.reply({
			components,
			flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		});
	} catch (error) {
		this.container.logger.error('Error listing reminders:', error);

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ An error occurred while listing reminders.'));

		return replyEphemeral(interaction, [container]);
	}
}

export function buildReminderListComponent(
	reminders: Reminder[],
	totalCount: number,
	currentPage: number,
	totalPages: number
): ContainerBuilder {
	const container = new ContainerBuilder();

	// Add title with page info
	const titleWithPage = totalPages > 1 ? `📋 Your Reminders (Page ${currentPage}/${totalPages})` : '📋 Your Reminders';
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titleWithPage}`));
	container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

	// Add each reminder
	for (const reminder of reminders) {
		const timeString = `<t:${Math.floor(reminder.remindAt.getTime() / 1000)}:R>`;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${reminder.uuid}** - ${timeString}`));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(reminder.message));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
	}

	// Add pagination info if multiple pages
	if (totalPages > 1) {
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		const paginationInfo = `Showing ${reminders.length} of ${totalCount} reminders`;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`*${paginationInfo}*`));
	}

	return container;
}
