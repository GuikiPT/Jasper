// supportThreadReminderButton module within interaction-handlers
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ChannelType,
	ContainerBuilder,
	MessageFlags,
	ModalBuilder,
	TextDisplayBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
	type ThreadChannel
} from 'discord.js';
import {
	SUPPORT_THREAD_ACTION_CLOSE,
	SUPPORT_THREAD_ACTION_KEEP_OPEN,
	SUPPORT_THREAD_BUTTON_PREFIX,
	SUPPORT_THREAD_CLOSE_MODAL_PREFIX,
	SUPPORT_THREAD_CLOSE_REASON_FIELD
} from '../lib/supportThreadConstants.js';

interface ReminderButtonMetadata {
	action: typeof SUPPORT_THREAD_ACTION_CLOSE | typeof SUPPORT_THREAD_ACTION_KEEP_OPEN;
	threadId: string;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class SupportThreadReminderButtonHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const segments = interaction.customId.split(':');
		if (segments.length !== 3) {
			return this.none();
		}

		const [prefix, action, threadId] = segments;
		if (prefix !== SUPPORT_THREAD_BUTTON_PREFIX) {
			return this.none();
		}
		if (action !== SUPPORT_THREAD_ACTION_KEEP_OPEN && action !== SUPPORT_THREAD_ACTION_CLOSE) {
			return this.none();
		}
		if (!threadId) {
			return this.none();
		}

		return this.some<ReminderButtonMetadata>({ action, threadId });
	}

	public override async run(interaction: ButtonInteraction, data: ReminderButtonMetadata) {
		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({
				content: 'This component can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		const thread = await this.fetchThread(data.threadId);
		if (!thread) {
			return interaction.update({
				components: [this.buildExpiredComponent()]
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
				content: 'This component isn’t associated with a valid support thread.',
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
				content: 'Only the thread author can use these buttons.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (data.action === SUPPORT_THREAD_ACTION_KEEP_OPEN) {
			return this.keepThreadOpen(interaction, thread, ownerId);
		}

		return this.openCloseModal(interaction, thread.id);
	}

	private async keepThreadOpen(interaction: ButtonInteraction, thread: ThreadChannel, ownerId: string) {
		try {
			await this.container.supportThreadService.recordAuthorActivity({
				threadId: thread.id,
				guildId: thread.guildId,
				authorId: ownerId,
				timestamp: new Date()
			});

			const acknowledgement = this.buildAcknowledgedComponent(interaction.user.id);
			return interaction.update({ components: [acknowledgement] });
		} catch (error) {
			this.container.logger.error('Failed to keep support thread open via button', error, {
				threadId: thread.id
			});
			return interaction.reply({
				content: 'I couldn’t update the thread. Please try again shortly.',
				flags: MessageFlags.Ephemeral
			});
		}
	}

	private async openCloseModal(interaction: ButtonInteraction, threadId: string) {
		const modal = new ModalBuilder()
			.setCustomId(`${SUPPORT_THREAD_CLOSE_MODAL_PREFIX}:${threadId}`)
			.setTitle('Close thread due to inactivity')
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId(SUPPORT_THREAD_CLOSE_REASON_FIELD)
						.setLabel('Why are you closing the thread?')
						.setStyle(TextInputStyle.Paragraph)
						.setRequired(true)
						.setMaxLength(500)
				)
			);

		return interaction.showModal(modal);
	}

	private async fetchThread(threadId: string): Promise<ThreadChannel | null> {
		try {
			const channel = await this.container.client.channels.fetch(threadId);
			if (!channel || channel.type !== ChannelType.PublicThread) return null;
			return channel as ThreadChannel;
		} catch (error) {
			this.container.logger.debug('Failed to fetch support thread for reminder interaction', error, {
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
			this.container.logger.debug('Failed to resolve thread owner during reminder interaction', error, {
				threadId: thread.id
			});
			return null;
		}
	}

	private buildAcknowledgedComponent(userId: string): ContainerBuilder {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ Thread kept open by <@${userId}>.`));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('We’ll notify you again if we detect another period of inactivity.'));
		return container;
	}

	private buildExpiredComponent(): ContainerBuilder {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('This reminder is no longer active.'));
		return container;
	}
}
