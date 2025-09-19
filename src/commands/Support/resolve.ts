import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	ChannelType,
	type ThreadChannel,
	type ForumChannel,
	type SlashCommandBuilder,
	type SlashCommandStringOption
} from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'resolve',
	description: 'Resolve a support thread with a summary and apply resolved tag.',
	fullCategory: ['Support'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 1,
	cooldownDelay: 10_000,
	cooldownScope: BucketScope.Channel,
	preconditions: ['SupportRoles'],
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
						.setRequired(true)
						.setMaxLength(1000)
				)
				.addStringOption((option: SlashCommandStringOption) =>
					option
						.setName('answer')
						.setDescription('Summarized answer/solution provided')
						.setRequired(true)
						.setMaxLength(2000)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return interaction.reply({
				content: 'This command can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		const question = interaction.options.getString('question', true);
		const answer = interaction.options.getString('answer', true);

		// Check if we're in a thread
		if (!interaction.channel || interaction.channel.type !== ChannelType.PublicThread) {
			return interaction.reply({
				content: 'This command can only be used in a forum thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		const thread = interaction.channel as ThreadChannel;

		// Check if the thread is from a forum channel
		if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) {
			return interaction.reply({
				content: 'This command can only be used in a support forum thread.',
				flags: MessageFlags.Ephemeral
			});
		}

		try {
			return await this.resolveThread(interaction, thread, question, answer);
		} catch (error) {
			this.container.logger.error('Failed to resolve thread:', error);
			return interaction.reply({
				content: 'An error occurred while resolving the thread. Please try again.',
				flags: MessageFlags.Ephemeral
			});
		}
	}

	private async resolveThread(
		interaction: Command.ChatInputCommandInteraction,
		thread: ThreadChannel,
		question: string,
		answer: string
	) {
		const guildId = interaction.guildId!;
		const forumChannel = thread.parent as ForumChannel;

		// Get support settings from database
		const supportSettings = await this.container.database.guildSupportSettings.findUnique({
			where: { guildId }
		});

		// Validate this is the configured support forum
		if (!supportSettings?.supportForumChannelId || supportSettings.supportForumChannelId !== forumChannel.id) {
			return interaction.reply({
				content: 'This thread is not in the configured support forum channel.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (!supportSettings.resolvedTagId) {
			return interaction.reply({
				content: 'No resolved tag is configured for this server. Please ask an admin to configure it using `/settings support set`.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// Check if the resolved tag exists in the forum
		const resolvedTag = forumChannel.availableTags.find(tag => tag.id === supportSettings.resolvedTagId);
		if (!resolvedTag) {
			return interaction.editReply({
				content: 'The configured resolved tag no longer exists in the forum. Please ask an admin to update the configuration.'
			});
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

			// Send resolution message
			const resolutionMessage = this.formatResolutionMessage(question, answer, interaction.user.username);
			await freshThread.send(resolutionMessage);

			// Archive and lock the thread
			await freshThread.setLocked(true, 'Thread resolved');
			await freshThread.setArchived(true, 'Thread resolved');

			return interaction.editReply({
				content: `✅ Thread resolved successfully!\n\n**Question:** ${question}\n**Answer:** ${answer}\n\nThe thread has been tagged, archived, and locked.`
			});

		} catch (error) {
			this.container.logger.error('Failed to apply thread resolution:', error);
			return interaction.editReply({
				content: 'Failed to apply thread resolution. I might not have the necessary permissions.'
			});
		}
	}

	private formatResolutionMessage(question: string, answer: string, resolverUsername: string): string {
		return [
			'## 🔒 Thread Resolved',
			'',
			`**Question:** ${question}`,
			'',
			`**Solution:** ${answer}`,
			'',
			`*Resolved by ${resolverUsername}*`,
			'',
			'This thread has been marked as resolved and will be archived. If you need further assistance, please create a new thread.'
		].join('\n');
	}
}