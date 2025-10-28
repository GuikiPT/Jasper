// supportThreadCloseModal module within interaction-handlers
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
	ChannelType,
	ContainerBuilder,
	MessageFlags,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	type ModalSubmitInteraction,
	type ThreadChannel
} from 'discord.js';
import {
	SUPPORT_THREAD_CLOSE_MODAL_PREFIX,
	SUPPORT_THREAD_CLOSE_REASON_FIELD
} from '../lib/supportThreadConstants.js';

interface CloseModalMetadata {
	threadId: string;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SupportThreadCloseModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		const segments = interaction.customId.split(':');
		if (segments.length !== 2) {
			return this.none();
		}

		const [prefix, threadId] = segments;
		if (prefix !== SUPPORT_THREAD_CLOSE_MODAL_PREFIX) {
			return this.none();
		}

		return this.some<CloseModalMetadata>({ threadId });
	}

	public override async run(interaction: ModalSubmitInteraction, data: CloseModalMetadata) {
		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({
				content: 'This modal can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		const reason = interaction.fields.getTextInputValue(SUPPORT_THREAD_CLOSE_REASON_FIELD)?.trim();
		if (!reason) {
			return interaction.reply({
				content: 'You must provide a reason to close the thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		const thread = await this.fetchThread(data.threadId);
		if (!thread) {
			return interaction.reply({
				content: 'I couldn’t find the support thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		const settings = await this.container.guildSupportSettingsService.getSettings(guildId);
		if (!settings || !settings.supportForumChannelId) {
			return interaction.reply({
				content: 'Support settings are not configured for this server.',
				flags: MessageFlags.Ephemeral
			});
		}
		if (!thread.parent || thread.parent.id !== settings.supportForumChannelId) {
			return interaction.reply({
				content: 'This modal is not associated with a valid support thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		const ownerId = await this.resolveThreadOwnerId(thread);
		if (!ownerId) {
			return interaction.reply({
				content: 'I couldn’t determine who created this thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (interaction.user.id !== ownerId) {
			return interaction.reply({
				content: 'Only the thread author can close it from here.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const record = await this.container.supportThreadService.getThread(thread.id);
		const reminderMessageId = record?.reminderMessageId ?? null;

		try {
			const freshThread = await thread.fetch();

			const wasArchived = freshThread.archived;
			if (wasArchived) {
				await freshThread.setArchived(false, `Temporarily reopening by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id}.`);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			if (reminderMessageId) {
				await this.dismissReminderMessage(freshThread, reminderMessageId);
			}

			if (settings.resolvedTagId) {
				await this.applyResolvedTag(freshThread, settings.resolvedTagId);
			}

			const component = this.buildManualClosureComponent(interaction.user.id, reason);
			await freshThread.send({
				components: [component],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			});

			await freshThread.setLocked(true, `Locked by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id} via modal.`);
			await freshThread.setArchived(true, `Archived by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id} via modal.`);

			await this.container.supportThreadService.markThreadClosed(thread.id);

			return interaction.editReply({
				content: 'Thread closed successfully. Thanks for confirming!'
			});
		} catch (error) {
			this.container.logger.error('Failed to close support thread via modal', error, {
				threadId: thread.id
			});
			return interaction.editReply({
				content: 'I couldn’t close the thread. Please try again shortly.'
			});
		}
	}

	private async fetchThread(threadId: string): Promise<ThreadChannel | null> {
		try {
			const channel = await this.container.client.channels.fetch(threadId);
			if (!channel || channel.type !== ChannelType.PublicThread) return null;
			return channel as ThreadChannel;
		} catch (error) {
			this.container.logger.debug('Failed to fetch support thread for closure modal', error, {
				threadId
			});
			return null;
		}
	}

	private async resolveThreadOwnerId(thread: ThreadChannel): Promise<string | null> {
		if (thread.ownerId) return thread.ownerId;
		try {
			const owner = await thread.fetchOwner();
			return owner?.id ?? null;
		} catch (error) {
			this.container.logger.debug('Failed to resolve thread owner for closure modal', error, {
				threadId: thread.id
			});
			return null;
		}
	}

	private async applyResolvedTag(thread: ThreadChannel, resolvedTagId: string) {
		try {
			let newTags = [...thread.appliedTags];
			newTags = newTags.filter((tagId) => tagId !== resolvedTagId);
			if (newTags.length >= 5) {
				newTags = newTags.slice(-(4));
			}
			newTags.push(resolvedTagId);

			await thread.setAppliedTags(newTags, 'Marking as resolved by the author.');
		} catch (error) {
			this.container.logger.debug('Failed to apply resolved tag via closure modal', error, {
				threadId: thread.id,
				resolvedTagId
			});
		}
	}

	private buildManualClosureComponent(userId: string, reason: string): ContainerBuilder {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`## Thread closed by <@${userId}>`)
		);
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('### Provided reason')
		);
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(reason)
		);
		return container;
	}

	private async dismissReminderMessage(thread: ThreadChannel, messageId: string) {
		try {
			const reminderMessage = await thread.messages.fetch(messageId);
			await reminderMessage.delete();
		} catch (error) {
			this.container.logger.debug('Failed to remove reminder message during modal closure', error, {
				threadId: thread.id,
				messageId
			});
		}
	}
}
