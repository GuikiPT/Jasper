import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags } from 'discord.js';
import type { Message } from 'discord.js';

interface GuildTopic {
	id: number;
	value: string;
}

@ApplyOptions<Command.Options>({
	name: 'topic',
	description: "Send a random discussion topic from this server's database.",
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
			return message.reply('No topics configured yet. Ask an admin to add some with `/settings topic add`.');
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
				content: 'No topics configured yet. Ask an admin to add some with `/settings topic add`.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.channel.send({ content: this.formatTopic(topic) });

		return interaction.reply({
			content: 'Topic sent.',
			flags: MessageFlags.Ephemeral
		});
	}

	private async fetchRandomTopic(guildId: string): Promise<GuildTopic | null> {
		try {
			const total = await this.container.database.guildTopic.count({
				where: { guildId }
			});

			if (total === 0) {
				return null;
			}

			const skip = Math.floor(Math.random() * total);
			const entry = await this.container.database.guildTopic.findFirst({
				where: { guildId },
				skip,
				take: 1
			});

			if (!entry) {
				return null;
			}

			return { id: entry.id, value: entry.value } satisfies GuildTopic;
		} catch (error) {
			this.container.logger.error('Failed to fetch random topic', error);
			return null;
		}
	}

	private formatTopic(topic: GuildTopic) {
		return `## ${topic.value}`;
	}
}
