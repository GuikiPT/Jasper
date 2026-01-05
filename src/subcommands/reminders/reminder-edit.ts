import { Duration } from '@sapphire/duration';
import { ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import type { ReminderCommand, ReminderChatInputInteraction } from './utils.js';
import { replyEphemeral } from './utils.js';

export async function chatInputReminderEdit(this: ReminderCommand, interaction: ReminderChatInputInteraction) {
	const reminderUuid = interaction.options.getString('id', true);
	const whenString = interaction.options.getString('when');
	const newMessage = interaction.options.getString('message');

	if (!whenString && !newMessage) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('❌ Please provide at least one field to update (when or message).')
		);

		return replyEphemeral(interaction, [container]);
	}

	try {
		// Check if reminder exists and belongs to user
		const reminder = await this.container.database.reminder.findUnique({
			where: { uuid: reminderUuid }
		});

		if (!reminder) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Reminder not found.'));

			return replyEphemeral(interaction, [container]);
		}

		if (reminder.userId !== interaction.user.id) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ You can only edit your own reminders.'));

			return replyEphemeral(interaction, [container]);
		}

		const updateData: { remindAt?: Date; message?: string } = {};

		// Parse new time if provided
		if (whenString) {
			const duration = new Duration(whenString);
			const milliseconds = duration.offset;

			if (milliseconds <= 0 || isNaN(milliseconds)) {
				const container = new ContainerBuilder();
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						'❌ Invalid time format. Please use formats like "in 1 hour", "in 30 minutes", etc.'
					)
				);

				return replyEphemeral(interaction, [container]);
			}

			const maxDuration = 365 * 24 * 60 * 60 * 1000; // 1 year
			if (milliseconds > maxDuration) {
				const container = new ContainerBuilder();
				container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Reminder duration cannot exceed 1 year.'));

				return replyEphemeral(interaction, [container]);
			}

			updateData.remindAt = new Date(Date.now() + milliseconds);
		}

		// Update message if provided
		if (newMessage) {
			updateData.message = newMessage;
		}

		// Update the reminder
		const updatedReminder = await this.container.database.reminder.update({
			where: { uuid: reminderUuid },
			data: updateData
		});

		// Build success message with same structure as reminder delivery
		const components = [
			new ContainerBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent('### ✅ Reminder Updated'))
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`***You asked me to remind you about:***\n> ${updatedReminder.message}`)
				)
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`-# ${updatedReminder.uuid} • <t:${Math.floor(updatedReminder.remindAt.getTime() / 1000)}:R>`
					)
				)
		];

		return replyEphemeral(interaction, components);
	} catch (error) {
		this.container.logger.error('Error editing reminder:', error);

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ An error occurred while editing the reminder.'));

		return replyEphemeral(interaction, [container]);
	}
}
