// Support thread close modal handler - processes manual thread closure with reason
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
import { SUPPORT_THREAD_CLOSE_MODAL_PREFIX, SUPPORT_THREAD_CLOSE_REASON_FIELD } from '../lib/supportThreadConstants.js';

// Parsed modal metadata
interface CloseModalMetadata {
	threadId: string;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SupportThreadCloseModalHandler extends InteractionHandler {
	// Parse modal custom ID and extract thread ID
	public override parse(interaction: ModalSubmitInteraction) {
		// Expected format: prefix:threadId
		const segments = interaction.customId.split(':');
		if (segments.length !== 2) {
			return this.none();
		}

		const [prefix, threadId] = segments;

		// Validate modal prefix
		if (prefix !== SUPPORT_THREAD_CLOSE_MODAL_PREFIX) {
			return this.none();
		}

		return this.some<CloseModalMetadata>({ threadId });
	}

	// Handle modal submission and close thread
	public override async run(interaction: ModalSubmitInteraction, data: CloseModalMetadata) {
		// Validate guild context
		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({
				content: 'This modal can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Extract closure reason from modal field
		const reason = interaction.fields.getTextInputValue(SUPPORT_THREAD_CLOSE_REASON_FIELD)?.trim();
		if (!reason) {
			return interaction.reply({
				content: 'You must provide a reason to close the thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Fetch thread from ID
		const thread = await this.fetchThread(data.threadId);
		if (!thread) {
			return interaction.reply({
				content: 'I couldn\'t find the support thread.',
                flags: MessageFlags.Ephemeral
			});
		}

		// Validate support settings exist
		const settings = await this.container.guildSupportSettingsService.getSettings(guildId);
		if (!settings || !settings.supportForumChannelId) {
			return interaction.reply({
				content: 'Support settings are not configured for this server.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Validate thread is in configured support forum
		if (!thread.parent || thread.parent.id !== settings.supportForumChannelId) {
			return interaction.reply({
				content: 'This modal is not associated with a valid support thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Resolve thread owner
		const ownerId = await this.resolveThreadOwnerId(thread);
		if (!ownerId) {
			return interaction.reply({
				content: 'I couldn\'t determine who created this thread.',
                flags: MessageFlags.Ephemeral
			});
		}

		// Verify user is thread owner
		if (interaction.user.id !== ownerId) {
			return interaction.reply({
				content: 'Only the thread author can close it from here.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// Get reminder message ID if exists
		const record = await this.container.supportThreadService.getThread(thread.id);
		const reminderMessageId = record?.reminderMessageId ?? null;

		try {
			// Fetch fresh thread state
			const freshThread = await thread.fetch();

			// Unarchive thread if needed to apply changes
			const wasArchived = freshThread.archived;
			if (wasArchived) {
				await freshThread.setArchived(
					false,
					`Temporarily reopening by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id}.`
				);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			// Delete reminder message if present
			if (reminderMessageId) {
				await this.dismissReminderMessage(freshThread, reminderMessageId);
			}

			// Apply resolved tag if configured
			if (settings.resolvedTagId) {
				await this.applyResolvedTag(freshThread, settings.resolvedTagId);
			}

			// Send closure message with reason
			const component = this.buildManualClosureComponent(interaction.user.id, reason);
			await freshThread.send({
				components: [component],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [], roles: [] }
			});

			// Lock thread to prevent further replies
			await freshThread.setLocked(true, `Locked by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id} via modal.`);

			// Archive thread
			await freshThread.setArchived(
				true,
				`Archived by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id} via modal.`
			);

			// Mark as closed in database
			await this.container.supportThreadService.markThreadClosed(thread.id);

			return interaction.editReply({
				content: 'Thread closed successfully. Thanks for confirming!'
			});
		} catch (error) {
			this.container.logger.error('Failed to close support thread via modal', error, {
				threadId: thread.id
			});
			return interaction.editReply({
				content: 'I couldn\'t close the thread.Please try again shortly.'
            });
		}
	}

	// Fetch thread channel by ID
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

	// Resolve thread owner ID from thread object or API
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

	// Apply resolved tag to thread (respecting 5-tag Discord limit)
	private async applyResolvedTag(thread: ThreadChannel, resolvedTagId: string) {
		try {
			let newTags = [...thread.appliedTags];

			// Remove resolved tag if already present to avoid duplicates
			newTags = newTags.filter((tagId) => tagId !== resolvedTagId);

			// Keep only 4 most recent tags if at limit
			if (newTags.length >= 5) {
				newTags = newTags.slice(-4);
			}

			// Add resolved tag
			newTags.push(resolvedTagId);

			await thread.setAppliedTags(newTags, 'Marking as resolved by the author.');
		} catch (error) {
			this.container.logger.debug('Failed to apply resolved tag via closure modal', error, {
				threadId: thread.id,
				resolvedTagId
			});
		}
	}

	// Build closure message component with user and reason
	private buildManualClosureComponent(userId: string, reason: string): ContainerBuilder {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Thread closed by <@${userId}>`));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Provided reason'));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(reason));
		return container;
	}

	// Delete reminder message if present
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
