// Resolve command - closes support forum threads with optional summary
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	ChannelType,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	type ThreadChannel,
	type ForumChannel,
	type SlashCommandBuilder,
	type SlashCommandStringOption
} from 'discord.js';
import { replyWithComponent, editReplyWithComponent } from '../../lib/components.js';

@ApplyOptions<Command.Options>({
	name: 'resolve',
	description: 'Resolve a support thread with a summary and apply resolved tag.',
	detailedDescription: {
		summary: 'Summarises the current support forum thread, applies the configured resolved tag, and archives the thread.',
		chatInputUsage: '/resolve [question] [answer]',
		examples: ["/resolve question:'How do I reset my password?' answer:'Use `/settings > Account` and choose Reset Password.'"],
		notes: [
			'Only works inside the configured support forum thread.',
			'Requires an allowed support, staff, or admin role and the Manage Threads permission.'
		]
	},
	fullCategory: ['Support'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 1,
	cooldownDelay: 10_000,
	cooldownScope: BucketScope.Channel,
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
				allowManageGuild: false,
				errorMessage: 'You need an allowed tag role, staff role, or admin role to use this command.'
			}
		}
	],
	requiredClientPermissions: ['SendMessages', 'ManageThreads']
})
export class ResolveCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	// Register slash command with optional question and answer fields
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addStringOption((option: SlashCommandStringOption) =>
					option.setName('question').setDescription('Summarized question that was asked').setRequired(false).setMaxLength(1000)
				)
				.addStringOption((option: SlashCommandStringOption) =>
					option.setName('answer').setDescription('Summarized answer/solution provided').setRequired(false).setMaxLength(2000)
				)
		);
	}

	// Handle /resolve command execution
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		// Validate guild context
		if (!interaction.guildId) {
			return replyWithComponent(interaction, 'This command can only be used inside a server.', true);
		}

		const question = interaction.options.getString('question', false);
		const answer = interaction.options.getString('answer', false);

		// Validate thread context
		if (!interaction.channel || interaction.channel.type !== ChannelType.PublicThread) {
			return replyWithComponent(interaction, 'This command can only be used in a forum thread.', true);
		}

		const thread = interaction.channel as ThreadChannel;

		// Validate forum channel context
		if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) {
			return replyWithComponent(interaction, 'This command can only be used in a support forum thread.', true);
		}

		try {
			return await this.resolveThread(interaction, thread, question, answer);
		} catch (error) {
			this.container.logger.error('[Resolve] Failed to process command', error, {
				guildId: interaction.guildId,
				threadId: thread.id,
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			return replyWithComponent(interaction, 'An error occurred while resolving the thread. Please try again.', true);
		}
	}

	// Execute thread resolution workflow
	private async resolveThread(
		interaction: Command.ChatInputCommandInteraction,
		thread: ThreadChannel,
		question: string | null,
		answer: string | null
	) {
		const guildId = interaction.guildId!;
		const forumChannel = thread.parent as ForumChannel;

		// Get support settings service
		const supportService = this.container.guildSupportSettingsService;
		if (!supportService) {
			this.container.logger.error('Support settings service is not available');
			return replyWithComponent(interaction, 'Support settings are not available right now. Please try again later.', true);
		}

		// Load guild support configuration
		let supportSettings;
		try {
			supportSettings = await supportService.getSettings(guildId);
		} catch (error) {
			this.container.logger.error('[Resolve] Failed to load support settings', error, {
				guildId
			});
			return replyWithComponent(interaction, 'I could not load support settings right now. Please try again later.', true);
		}

		if (!supportSettings) {
			return replyWithComponent(
				interaction,
				'Support settings have not been configured yet. Please ask an admin to run `/settings support set`.',
				true
			);
		}

		// Validate this is the configured support forum
		if (!supportSettings.supportForumChannelId || supportSettings.supportForumChannelId !== forumChannel.id) {
			return replyWithComponent(interaction, 'This thread is not in the configured support forum channel.', true);
		}

		if (!supportSettings.resolvedTagId) {
			return replyWithComponent(
				interaction,
				'No resolved tag is configured for this server. Please ask an admin to configure it using `/settings support set`.',
				true
			);
		}

		try {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		} catch (error) {
			this.container.logger.error('[Resolve] Failed to defer reply', error, {
				guildId,
				threadId: thread.id,
				interactionId: interaction.id,
				userId: interaction.user.id
			});
			if (!interaction.deferred && !interaction.replied) {
				return replyWithComponent(interaction, 'I could not start resolving the thread because the reply was rejected.', true);
			}
			try {
				return editReplyWithComponent(interaction, 'I could not start resolving the thread because the reply was rejected.');
			} catch (replyError) {
				this.container.logger.error('[Resolve] Failed to send defer fallback', replyError, {
					guildId,
					threadId: thread.id,
					interactionId: interaction.id,
					userId: interaction.user.id
				});
				return;
			}
		}

		// Verify resolved tag still exists
		const resolvedTag = forumChannel.availableTags.find((tag) => tag.id === supportSettings.resolvedTagId);
		if (!resolvedTag) {
			return editReplyWithComponent(
				interaction,
				'The configured resolved tag no longer exists in the forum. Please ask an admin to update the configuration.'
			);
		}

		// Prepare new tag list (max 5 tags in Discord)
		let newTags = [...thread.appliedTags];

		// Remove resolved tag if already present to avoid duplicates
		newTags = newTags.filter((tagId) => tagId !== supportSettings.resolvedTagId);

		// Keep only the 4 most recent tags if at limit
		if (newTags.length >= 5) {
			newTags = newTags.slice(-4);
		}

		// Add the resolved tag
		newTags.push(supportSettings.resolvedTagId);

		try {
			// Fetch fresh thread data to ensure current state
			const freshThread = await thread.fetch();

			// Unarchive thread if needed to apply changes
			if (freshThread.archived) {
				await freshThread.setArchived(
					false,
					`Temporarily reopening thread by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id}.`
				);
				// Wait for Discord to process unarchive
				await new Promise((resolve) => setTimeout(resolve, 1000));
				this.container.logger.debug('[Resolve] Reopened archived thread to apply updates', {
					guildId,
					threadId: thread.id,
					interactionId: interaction.id,
					userId: interaction.user.id
				});
			}

			// Apply resolved tag
			await freshThread.setAppliedTags(
				newTags,
				`Thread resolved by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id}${answer ? ` | Answer: ${answer}` : ''}`
			);
			this.container.logger.debug('[Resolve] Applied resolved tag', {
				guildId,
				threadId: thread.id,
				resolvedTagId: supportSettings.resolvedTagId,
				interactionId: interaction.id,
				userId: interaction.user.id,
				appliedTags: newTags
			});

			// Send resolution summary message
			const resolutionComponent = this.createResolutionComponent(question, answer, interaction.user.id);
			await freshThread.send({
				components: [resolutionComponent],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [] } // Prevent pinging the resolver
			});
			this.container.logger.debug('[Resolve] Posted resolution summary message', {
				guildId,
				threadId: thread.id,
				interactionId: interaction.id,
				userId: interaction.user.id
			});

			// Lock thread to prevent further replies
			await freshThread.setLocked(
				true,
				`Thread locked by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id}${answer ? ` | Answer: ${answer}` : ''}`
			);
			this.container.logger.debug('[Resolve] Locked thread after resolution', {
				guildId,
				threadId: thread.id,
				interactionId: interaction.id,
				userId: interaction.user.id
			});

			// Archive thread
			await freshThread.setArchived(
				true,
				`Thread archived by <@!${interaction.user.id}> - ${interaction.user.tag} - ${interaction.user.id}${answer ? ` | Answer: ${answer}` : ''}`
			);
			this.container.logger.debug('[Resolve] Archived thread after resolution', {
				guildId,
				threadId: thread.id,
				interactionId: interaction.id,
				userId: interaction.user.id
			});

			// Update internal tracking
			await this.markSupportThreadClosed(freshThread);
			this.container.logger.debug('[Resolve] Thread resolved successfully', {
				guildId,
				threadId: thread.id,
				interactionId: interaction.id,
				userId: interaction.user.id,
				questionProvided: Boolean(question),
				answerProvided: Boolean(answer)
			});

			return editReplyWithComponent(interaction, '✅ Thread resolved successfully!');
		} catch (error) {
			this.container.logger.error('[Resolve] Failed to apply thread resolution', error, {
				guildId,
				threadId: thread.id,
				interactionId: interaction.id,
				userId: interaction.user.id
			});
			try {
				return editReplyWithComponent(interaction, 'Failed to apply thread resolution. I might not have the necessary permissions.');
			} catch (replyError) {
				this.container.logger.error('[Resolve] Failed to send resolution error fallback', replyError, {
					guildId,
					threadId: thread.id,
					interactionId: interaction.id,
					userId: interaction.user.id
				});
				return;
			}
		}
	}

	// Mark thread as closed in database and remove reminder
	private async markSupportThreadClosed(thread: ThreadChannel) {
		const service = this.container.supportThreadService;
		if (!service) return;

		try {
			const record = await service.getThread(thread.id);
			if (record?.reminderMessageId) {
				await this.tryDeleteReminderMessage(thread, record.reminderMessageId);
			}
			await service.markThreadClosed(thread.id);
			this.container.logger.debug('[Resolve] Marked support thread closed in database', {
				threadId: thread.id
			});
		} catch (error) {
			this.container.logger.debug('Failed to mark support thread as closed after /resolve', error, {
				threadId: thread.id
			});
		}
	}

	// Attempt to delete reminder message if present
	private async tryDeleteReminderMessage(thread: ThreadChannel, messageId: string) {
		try {
			const message = await thread.messages.fetch(messageId);
			await message.delete();
		} catch (error) {
			this.container.logger.debug('Failed to remove reminder message after /resolve', error, {
				threadId: thread.id,
				messageId
			});
		}
	}

	// Build resolution summary component with optional Q&A
	private createResolutionComponent(question: string | null, answer: string | null, resolverUserId: string): ContainerBuilder {
		const container = new ContainerBuilder();

		// Add header with resolver mention
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Thread marked as resolved by <@${resolverUserId}>`));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		// Add question section if provided
		if (question) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Question'));
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(question));
			container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		}

		// Add answer section if provided
		if (answer) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Answer'));
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(answer));
			container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		}

		// Add footer notice
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				'-# This thread has been marked as resolved. If you need further assistance, please create a new thread.'
			)
		);

		return container;
	}
}
