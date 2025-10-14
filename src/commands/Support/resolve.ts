// resolve module within commands/Support
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

// Implements the `/resolve` workflow for closing support threads with a summary.

@ApplyOptions<Command.Options>({
	name: 'resolve',
	description: 'Resolve a support thread with a summary and apply resolved tag.',
	detailedDescription: {
		summary: 'Summarises the current support forum thread, applies the configured resolved tag, and archives the thread.',
		chatInputUsage: '/resolve [question] [answer]',
		examples: [
			"/resolve question:'How do I reset my password?' answer:'Use `/settings > Account` and choose Reset Password.'"
		],
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

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addStringOption((option: SlashCommandStringOption) =>
					option
						.setName('question')
						.setDescription('Summarized question that was asked')
						.setRequired(false)
						.setMaxLength(1000)
				)
				.addStringOption((option: SlashCommandStringOption) =>
					option
						.setName('answer')
						.setDescription('Summarized answer/solution provided')
						.setRequired(false)
						.setMaxLength(2000)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return replyWithComponent(interaction, 'This command can only be used inside a server.', true);
		}

		const question = interaction.options.getString('question', false);
		const answer = interaction.options.getString('answer', false);

		// Check if we're in a thread
		if (!interaction.channel || interaction.channel.type !== ChannelType.PublicThread) {
			return replyWithComponent(interaction, 'This command can only be used in a forum thread.', true);
		}

		const thread = interaction.channel as ThreadChannel;

		// Check if the thread is from a forum channel
		if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) {
			return replyWithComponent(interaction, 'This command can only be used in a support forum thread.', true);
		}

		try {
			return await this.resolveThread(interaction, thread, question, answer);
		} catch (error) {
			this.container.logger.error('Failed to resolve thread:', error);
			return replyWithComponent(interaction, 'An error occurred while resolving the thread. Please try again.', true);
		}
	}

	private async resolveThread(
		interaction: Command.ChatInputCommandInteraction,
		thread: ThreadChannel,
		question: string | null,
		answer: string | null
	) {
		const guildId = interaction.guildId!;
		const forumChannel = thread.parent as ForumChannel;

		const supportService = this.container.guildSupportSettingsService;
		if (!supportService) {
			this.container.logger.error('Support settings service is not available');
			return replyWithComponent(interaction, 'Support settings are not available right now. Please try again later.', true);
		}

		const supportSettings = await supportService.getSettings(guildId);

		if (!supportSettings) {
			return replyWithComponent(interaction, 'Support settings have not been configured yet. Please ask an admin to run `/settings support set`.', true);
		}

		// Validate this is the configured support forum
		if (!supportSettings.supportForumChannelId || supportSettings.supportForumChannelId !== forumChannel.id) {
			return replyWithComponent(interaction, 'This thread is not in the configured support forum channel.', true);
		}

		if (!supportSettings.resolvedTagId) {
			return replyWithComponent(interaction, 'No resolved tag is configured for this server. Please ask an admin to configure it using `/settings support set`.', true);
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// Check if the resolved tag exists in the forum
		const resolvedTag = forumChannel.availableTags.find(tag => tag.id === supportSettings.resolvedTagId);
		if (!resolvedTag) {
			return editReplyWithComponent(interaction, 'The configured resolved tag no longer exists in the forum. Please ask an admin to update the configuration.');
		}

		// Manage thread tags - remove existing if 5+ and add resolved tag
		let newTags = [...thread.appliedTags];

		// Remove resolved tag if it already exists (to avoid duplicates)
		newTags = newTags.filter(tagId => tagId !== supportSettings.resolvedTagId);

		// If we have 5 or more tags, remove the oldest ones to make room
		if (newTags.length >= 5) {
			newTags = newTags.slice(-(4)); // Keep last 4 tags
		}

		// Add the resolved tag
		newTags.push(supportSettings.resolvedTagId);

		try {
			// Fetch fresh thread data to get current state
			const freshThread = await thread.fetch();

			// Check if thread is archived and unarchive it if needed
			if (freshThread.archived) {
				await freshThread.setArchived(false, 'Temporarily unarchiving to apply resolution');
				// Wait a moment for Discord to process the unarchive
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			// Apply the resolved tag
			await freshThread.setAppliedTags(newTags, 'Thread resolved by support staff');

			// Send resolution message as component
			const resolutionComponent = this.createResolutionComponent(question, answer, interaction.user.id);
			await freshThread.send({
				components: [resolutionComponent],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [] } // Prevent pinging the resolver
			});

			// Archive and lock the thread
			await freshThread.setLocked(true, 'Thread resolved');
			await freshThread.setArchived(true, 'Thread resolved');

			await this.markSupportThreadClosed(freshThread);

			// Simple success response
			return editReplyWithComponent(interaction, '✅ Thread resolved successfully!');

		} catch (error) {
			this.container.logger.error('Failed to apply thread resolution:', error);
			return editReplyWithComponent(interaction, 'Failed to apply thread resolution. I might not have the necessary permissions.');
		}
	}

	private async markSupportThreadClosed(thread: ThreadChannel) {
		const service = this.container.supportThreadService;
		if (!service) return;

		try {
			const record = await service.getThread(thread.id);
			if (record?.reminderMessageId) {
				await this.tryDeleteReminderMessage(thread, record.reminderMessageId);
			}
			await service.markThreadClosed(thread.id);
		} catch (error) {
			this.container.logger.debug('Failed to mark support thread as closed after /resolve', error, {
				threadId: thread.id
			});
		}
	}

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

	private createResolutionComponent(question: string | null, answer: string | null, resolverUserId: string): ContainerBuilder {
		const container = new ContainerBuilder();

		// Add title with resolver mention
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`## Thread marked as resolved by <@${resolverUserId}>`)
		);

		// Add separator
		container.addSeparatorComponents(
			new SeparatorBuilder()
				.setSpacing(SeparatorSpacingSize.Small)
				.setDivider(true)
		);

		// Add question section if provided
		if (question) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent('### Question')
			);
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(question)
			);
			container.addSeparatorComponents(
				new SeparatorBuilder()
					.setSpacing(SeparatorSpacingSize.Small)
					.setDivider(true)
			);
		}

		// Add answer section if provided
		if (answer) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent('### Answer')
			);
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(answer)
			);
			container.addSeparatorComponents(
				new SeparatorBuilder()
					.setSpacing(SeparatorSpacingSize.Small)
					.setDivider(true)
			);
		}

		// Add footer notice
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('-# This thread has been marked as resolved. If you need further assistance, please create a new thread.')
		);

		return container;
	}

}
