// topic module within commands/Moderation
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, type Message } from 'discord.js';

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

			if (!message.channel.isSendable()) {
				return message.reply('I cannot send messages in this channel.');
			}

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
			return message.channel.send({ content: this.formatTopic(topic) });
		} catch (error) {
			this.container.logger.error('[Topic] Failed to process prefix command', error, {
				guildId: message.guildId ?? 'dm'
			});
			return message.reply('I could not fetch a topic right now. Please try again later.').catch(() => this.container.logger.error('Failed to send reply after topic command failure', error));
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

			if (!interaction.channel || !interaction.channel.isSendable()) {
				return interaction.reply({
					content: 'I cannot send messages in this channel.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Fetch random topic from database
			const topic = await this.fetchRandomTopic(interaction.guildId);
			if (!topic) {
				return interaction.reply({
					content: 'No topics configured yet. Ask an admin to add some with `/settings topics add`.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Send formatted topic to channel
			await interaction.channel.send({ content: this.formatTopic(topic) });

			// Confirm to user ephemerally
			return interaction.reply({
				content: 'Topic sent.',
				flags: MessageFlags.Ephemeral
			});
		} catch (error) {
			this.container.logger.error('[Topic] Failed to process slash command', error, {
				guildId: interaction.guildId ?? 'dm',
				channelId: interaction.channelId
			});
			const fallbackFlags = MessageFlags.Ephemeral;
			if (interaction.deferred || interaction.replied) {
				return interaction.editReply({ content: 'I could not fetch a topic right now. Please try again later.' }).catch(() => this.container.logger.error('Failed to edit reply after topic command failure', error));
			}
			return interaction.reply({ content: 'I could not fetch a topic right now. Please try again later.', flags: fallbackFlags }).catch(() => this.container.logger.error('Failed to send reply after topic command failure', error));
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
			this.container.logger.error('Failed to fetch random topic', error);
			return null;
		}
	}

	// Format topic as markdown heading
	private formatTopic(topic: GuildTopicSettings): string {
		return `## ${topic.value}`;
	}
}
