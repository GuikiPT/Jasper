// topic module within commands/Moderation
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	type GuildBasedChannel,
	type GuildTextBasedChannel,
	type Message
} from 'discord.js';
import { replyWithComponent } from '../../lib/components.js';

interface GuildTopicSettings {
	id: number;
	value: string;
}

// Command for posting random discussion topics from guild configuration
@ApplyOptions<Command.Options>({
	name: 'topic',
	description: "Send a random discussion topic from this server's database.",
	detailedDescription: {
		summary: 'Posts a random topic saved for this guild so staff can reopen conversations quickly.',
		chatInputUsage: '/topic',
		messageUsage: '{{prefix}}topic',
		examples: ['/topic', '{{prefix}}topic'],
		notes: ['Topics are configured through `/settings topics`, and only allowed staff or admins can call this command.']
	},
	fullCategory: ['General'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.Channel,
	// Restrict to admin and staff roles
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['allowedAdminRoles', 'allowedStaffRoles'] as const,
				allowManageGuild: true,
				errorMessage: 'You need an allowed admin or staff role to use this command.'
			}
		}
	],
	requiredClientPermissions: ['SendMessages']
})
export class TopicCommand extends Command {
	// Guild-only installation and execution
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	// Register simple /topic slash command
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: this.integrationTypes,
			contexts: this.contexts
		});
	}

	// Handle prefix command: delete invoking message and post topic
	public override async messageRun(message: Message) {
		try {
			// Validate guild context and channel permissions
			if (!message.guildId) {
				return message.reply('This command can only be used inside a server.');
			}

			if (!this.canSendToChannel(message.channel)) {
				await message.author
					.send('I cannot send messages in that channel. Please adjust my permissions.')
					.catch(() => undefined);
				return;
			}

			const targetChannel = message.channel as GuildTextBasedChannel;

			// Fetch random topic from database
			const topic = await this.fetchRandomTopic(message.guildId);
			if (!topic) {
				return message.reply('No topics configured yet. Ask an admin to add some with `/settings topics add`.');
			}

			// Delete command message if possible
			if (message.deletable) {
				await message.delete().catch(() => undefined);
			}

			// Send formatted topic to channel
			const sent = await targetChannel.send({ content: this.formatTopic(topic) });

			this.container.logger.debug('[Topic] Posted random topic via prefix', {
				guildId: message.guildId,
				channelId: message.channelId,
				userId: message.author.id,
				topicId: topic.id,
				messageId: sent.id
			});

			return sent;
		} catch (error) {
			this.container.logger.error('[Topic] Failed to process prefix command', error, {
				guildId: message.guildId ?? 'dm',
				channelId: message.channelId,
				userId: message.author.id,
				messageId: message.id
			});
			return message.reply('I could not fetch a topic right now. Please try again later.').catch((replyError) => {
				this.container.logger.error('[Topic] Failed to send reply after prefix failure', replyError, {
					guildId: message.guildId ?? 'dm',
					channelId: message.channelId,
					userId: message.author.id,
					messageId: message.id
				});
				return undefined;
			});
		}
	}

	// Handle /topic: send topic to channel and confirm ephemerally
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		try {
			// Validate guild context and channel permissions
			if (!interaction.guildId) {
				return interaction.reply({
					content: 'This command can only be used inside a server.',
					flags: MessageFlags.Ephemeral
				});
			}

			if (!interaction.channel || !this.canSendToChannel(interaction.channel)) {
				return replyWithComponent(interaction, 'I cannot send messages in this channel. Please adjust my permissions.', true);
			}

			const targetChannel = interaction.channel as GuildTextBasedChannel;

			// Fetch random topic from database
			const topic = await this.fetchRandomTopic(interaction.guildId);
			if (!topic) {
				return interaction.reply({
					content: 'No topics configured yet. Ask an admin to add some with `/settings topics add`.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Send formatted topic to channel
			await targetChannel.send({ content: this.formatTopic(topic) });

			// Confirm to user ephemerally
			const reply = await interaction.reply({
				content: 'Topic sent.',
				flags: MessageFlags.Ephemeral
			});

			this.container.logger.debug('[Topic] Posted random topic via slash', {
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				userId: interaction.user.id,
				topicId: topic.id,
				interactionId: interaction.id
			});

			return reply;
		} catch (error) {
			this.container.logger.error('[Topic] Failed to process slash command', error, {
				guildId: interaction.guildId ?? 'dm',
				channelId: interaction.channelId,
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			const fallbackFlags = MessageFlags.Ephemeral;
			if (interaction.deferred || interaction.replied) {
				return interaction.editReply({ content: 'I could not fetch a topic right now. Please try again later.' }).catch((replyError) => {
					this.container.logger.error('[Topic] Failed to edit reply after slash failure', replyError, {
						guildId: interaction.guildId ?? 'dm',
						channelId: interaction.channelId,
						userId: interaction.user.id,
						interactionId: interaction.id
					});
					return undefined;
				});
			}
			return interaction
				.reply({ content: 'I could not fetch a topic right now. Please try again later.', flags: fallbackFlags })
				.catch((replyError) => {
					this.container.logger.error('[Topic] Failed to send reply after slash failure', replyError, {
						guildId: interaction.guildId ?? 'dm',
						channelId: interaction.channelId,
						userId: interaction.user.id,
						interactionId: interaction.id
					});
					return undefined;
				});
		}
	}

	// Fetch a random topic from the guild's configured topic list
	private async fetchRandomTopic(guildId: string): Promise<GuildTopicSettings | null> {
		const service = this.container.guildTopicSettingsService;
		if (!service) {
			this.container.logger.error('Topic service not initialised');
			return null;
		}

		try {
			const entry = await service.getRandomTopic(guildId);
			if (!entry) return null;

			return { id: entry.id, value: entry.value };
		} catch (error) {
			this.container.logger.error('Failed to fetch random topic', error, { guildId });
			return null;
		}
	}

	// Format topic as markdown heading
	private formatTopic(topic: GuildTopicSettings): string {
		return `## ${topic.value}`;
	}

	// Ensure the bot can view and send messages in the target channel
	private canSendToChannel(channel: Message['channel'] | NonNullable<Command.ChatInputCommandInteraction['channel']>): channel is GuildTextBasedChannel {
		if (!('guild' in channel) || !channel.guild) return false;

		const me = channel.guild.members.me;
		if (!me) return false;

		const permissions = me.permissionsIn(channel as GuildBasedChannel);
		if (!permissions.has('ViewChannel')) return false;

		if ('isThread' in channel && typeof channel.isThread === 'function' && channel.isThread()) {
			return permissions.has('SendMessagesInThreads');
		}

		return permissions.has('SendMessages');
	}
}
