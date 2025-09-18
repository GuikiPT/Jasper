import { ApplyOptions } from '@sapphire/decorators';
import { Args, BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits
} from 'discord.js';
import type { Message } from 'discord.js';

type PrefixHandlerParams = {
	guildId: string;
	providedPrefix: string | null;
	defaultPrefix: string | null;
	hasManageGuild: boolean;
};

@ApplyOptions<Subcommand.Options>({
	name: 'settings',
	description: 'Configure server-specific settings.',
	fullCategory: ['Settings'],
	aliases: ['prefix'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	subcommands: [
		{
			name: 'prefix',
			default: true,
			chatInputRun: 'chatInputPrefix',
			messageRun: 'messagePrefix'
		}
	]
})
export class SettingsCommand extends Subcommand {
	private readonly integrationTypes: ApplicationIntegrationType[] = [
		ApplicationIntegrationType.GuildInstall
	];

	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('prefix')
						.setDescription('View or update the prefix used for message commands.')
						.addStringOption((option) =>
							option
								.setName('value')
								.setDescription('New prefix to save. Leave empty to view the current prefix.')
								.setMaxLength(16)
						)
				)
		);
	}

	public async messagePrefix(message: Message, args: Args) {
		if (!message.guildId) {
			return message.reply('This command can only be used inside a server.');
		}

		const providedPrefix = await args.pick('string').catch(() => null);
		const defaultPrefix = this.getDefaultPrefix();
		const result = await this.handlePrefixCommon({
			guildId: message.guildId,
			providedPrefix,
			defaultPrefix,
			hasManageGuild: Boolean(message.member?.permissions.has(PermissionFlagsBits.ManageGuild))
		});

		return message.reply(result.content);
	}

	public async chatInputPrefix(interaction: Subcommand.ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return interaction.reply({
				content: 'This command can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const providedPrefix = interaction.options.getString('value');
		const defaultPrefix = this.getDefaultPrefix();
		const result = await this.handlePrefixCommon({
			guildId: interaction.guildId,
			providedPrefix,
			defaultPrefix,
			hasManageGuild: Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
		});

		return interaction.editReply({ content: result.content });
	}

	private getDefaultPrefix(): string | null {
		const defaults = this.container.client.options.defaultPrefix;

		if (!defaults) {
			return null;
		}

		if (typeof defaults === 'string') {
			return defaults;
		}

		return defaults[0] ?? null;
	}

	private async handlePrefixCommon({
		guildId,
		providedPrefix,
		defaultPrefix,
		hasManageGuild
	}: PrefixHandlerParams) {
		if (providedPrefix !== null) {
			if (!hasManageGuild) {
				return { content: 'You need the **Manage Server** permission to change the prefix.' };
			}

			const trimmedPrefix = providedPrefix.trim();

			if (trimmedPrefix.length === 0) {
				return { content: 'The prefix cannot be empty.' };
			}

			if (trimmedPrefix.length > 16) {
				return { content: 'The prefix must be 16 characters or fewer.' };
			}

			try {
				await this.container.database.guildConfig.upsert({
					where: { id: guildId },
					create: { id: guildId, prefix: trimmedPrefix },
					update: { prefix: trimmedPrefix }
				});
			} catch (error) {
				this.container.logger.error('Failed to update prefix in database', error);
				return { content: 'Failed to update the prefix. Please try again later.' };
			}

			return { content: `Updated the prefix to \`${trimmedPrefix}\`.` };
		}

		try {
			const guildConfig = await this.container.database.guildConfig.findUnique({
				where: { id: guildId }
			});
			const resolvedPrefix = guildConfig?.prefix ?? defaultPrefix;

			if (resolvedPrefix) {
				return { content: `The current prefix is \`${resolvedPrefix}\`.` };
			}

			return { content: 'There is no prefix configured for this server.' };
		} catch (error) {
			this.container.logger.error('Failed to load prefix from database', error);
			return { content: 'Failed to fetch the prefix. Please try again later.' };
		}
	}
}
