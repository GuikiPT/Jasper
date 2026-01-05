import { Duration } from '@sapphire/duration';
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import type { ReminderCommand } from './utils.js';

// Handle message command: !reminders edit <uuid> [when:<time>] [message:<message>]
export async function messageReminderEdit(this: ReminderCommand, message: Message, args: Args) {
	const reminderUuid = await args.pick('string').catch(() => null);

	if (!reminderUuid) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('❌ Please provide a reminder UUID to edit.')
		);

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}

	// Parse optional flags
	const whenString = await args.pickResult('string').then(r => r.isOk() ? r.unwrap() : null).catch(() => null);
	const newMessage = args.finished ? null : await args.rest('string');

	if (!whenString && !newMessage) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('❌ Please provide at least one field to update (when or message).')
		);

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}

	try {
		// Check if reminder exists and belongs to user
		const reminder = await this.container.database.reminder.findUnique({
			where: { uuid: reminderUuid }
		});

		if (!reminder) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Reminder not found.'));

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			});
		}

		if (reminder.userId !== message.author.id) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ You can only edit your own reminders.'));

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			});
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

				return message.reply({
					components: [container],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				});
			}

			const maxDuration = 365 * 24 * 60 * 60 * 1000; // 1 year
			if (milliseconds > maxDuration) {
				const container = new ContainerBuilder();
				container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Reminder duration cannot exceed 1 year.'));

				return message.reply({
					components: [container],
					flags: MessageFlags.IsComponentsV2,
					allowedMentions: { users: [], roles: [] }
				});
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

		// Build success message
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

		return message.reply({
			components,
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	} catch (error) {
		this.container.logger.error('Error editing reminder:', error);

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ An error occurred while editing the reminder.'));

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}
}
