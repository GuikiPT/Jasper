// topic module within commands/Moderation
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags } from 'discord.js';
import type { Message } from 'discord.js';

// Surfaces configured moderation topics either via prefix or slash command.
interface GuildTopicSettings {
	id: number;
	value: string;
}

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
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];

	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: this.integrationTypes,
			contexts: this.contexts
		});
	}

	public override async messageRun(message: Message) {
		if (!message.guildId) {
			return message.reply('This command can only be used inside a server.');
		}

		if (!message.channel.isSendable()) {
			return message.reply('I cannot send messages in this channel.');
		}

		const topic = await this.fetchRandomTopic(message.guildId);

		if (!topic) {
			return message.reply('No topics configured yet. Ask an admin to add some with `/settings topics add`.');
		}

		if (message.deletable) {
			await message.delete().catch(() => undefined);
		}

		return message.channel.send({ content: this.formatTopic(topic) });
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
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

		const topic = await this.fetchRandomTopic(interaction.guildId);

		if (!topic) {
			return interaction.reply({
				content: 'No topics configured yet. Ask an admin to add some with `/settings topics add`.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.channel.send({ content: this.formatTopic(topic) });

		return interaction.reply({
			content: 'Topic sent.',
			flags: MessageFlags.Ephemeral
		});
	}

	private async fetchRandomTopic(guildId: string): Promise<GuildTopicSettings | null> {
		const service = this.container.guildTopicSettingsService;
		if (!service) {
			this.container.logger.error('Topic service not initialised');
			return null;
		}

		try {
			const entry = await service.getRandomTopic(guildId);
			if (!entry) {
				return null;
			}

			return { id: entry.id, value: entry.value };
		} catch (error) {
			this.container.logger.error('Failed to fetch random topic', error);
			return null;
		}
	}

	private formatTopic(topic: GuildTopicSettings) {
		return `## ${topic.value}`;
	}
}
