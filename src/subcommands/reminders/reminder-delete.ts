import { ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import type { ReminderCommand, ReminderChatInputInteraction } from './utils.js';
import { replyEphemeral } from './utils.js';

export async function chatInputReminderDelete(this: ReminderCommand, interaction: ReminderChatInputInteraction) {
	const reminderUuid = interaction.options.getString('reminder', true);

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
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ You can only delete your own reminders.'));

			return replyEphemeral(interaction, [container]);
		}

		// Delete the reminder
		await this.container.database.reminder.delete({
			where: { uuid: reminderUuid }
		});

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Reminder Deleted'));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Reminder **${reminderUuid}** has been deleted.`));

		return replyEphemeral(interaction, [container]);
	} catch (error) {
		this.container.logger.error('Error deleting reminder:', error);

		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('❌ An error occurred while deleting the reminder.')
		);

		return replyEphemeral(interaction, [container]);
	}
}
