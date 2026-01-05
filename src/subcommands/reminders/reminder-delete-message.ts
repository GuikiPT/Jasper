import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import type { ReminderCommand } from './utils.js';

// Handle message command: !reminders delete <uuid>
export async function messageReminderDelete(this: ReminderCommand, message: Message, args: Args) {
	const reminderUuid = await args.pick('string').catch(() => null);

	if (!reminderUuid) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Please provide a reminder UUID to delete.'));

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
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ You can only delete your own reminders.'));

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			});
		}

		// Delete the reminder
		await this.container.database.reminder.delete({
			where: { uuid: reminderUuid }
		});

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Reminder Deleted'));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Reminder **${reminderUuid}** has been deleted.`));

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	} catch (error) {
		this.container.logger.error('Error deleting reminder:', error);

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('❌ An error occurred while deleting the reminder.')
		);

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { users: [], roles: [] }
		});
	}
}
