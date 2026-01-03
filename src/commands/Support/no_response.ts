// no_response command - quick access to the "no_response" tag
import { ApplyOptions } from '@sapphire/decorators';
import { Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	type SlashCommandUserOption
} from 'discord.js';
import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	buildTagComponents,
	ensureTagChannelAccess,
	formatTagChannelRestrictionMessage,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeTagName,
	replyEphemeral
} from '../../subcommands/support/tag/utils';

@ApplyOptions<Command.Options>({
	name: 'no_response',
	description: 'Send the "no_response" tag to the current channel.',
	detailedDescription: {
		summary: 'Quick access command to send the predefined "no_response" support tag.',
		chatInputUsage: '/no_response [user]',
		notes: [
			'This command uses the predefined "no_response" tag from the database.',
			'Requires an allowed tag role, staff role, or admin role.',
			'Optionally mention a user alongside the tag.'
		]
	},
	fullCategory: ['Support'],
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
	requiredClientPermissions: ['SendMessages'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class NoResponseCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addUserOption((option: SlashCommandUserOption) =>
					option.setName('user').setDescription('Mention a user alongside the tag.').setRequired(false)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		try {
			return await this.handleCommand(interaction);
		} catch (error) {
			return this.handleError(interaction, error);
		}
	}

	private async handleCommand(interaction: Command.ChatInputCommandInteraction) {
		// Validate guild context
		const guildId = interaction.guildId;
		if (!guildId) {
			return replyEphemeral(interaction, 'This command can only be used inside a server.');
		}

		// Get optional user mention
		const user = interaction.options.getUser('user');

		// Check channel restrictions
		const access = await ensureTagChannelAccess(this, interaction);
		if (!access.allowed) {
			const message = formatTagChannelRestrictionMessage(access, {
				unconfigured:
					'Support tags cannot be used yet because no allowed channels have been configured. Use `/settings channels add` with the `allowedTagChannels` setting to choose where tags may be used.',
				single: (channel) => `Support tags may only be used in ${channel}.`,
				multiple: (channels) => `Support tags may only be used in the following channels: ${channels}.`
			});
			return replyEphemeral(interaction, message);
		}

		// Find the "no_response" tag
		const tagName = normalizeTagName('no_response');
		const service = this.container.supportTagService;
		if (!service) {
			return replyEphemeral(interaction, 'Support tag service is not initialised.');
		}

		let tag;
		try {
			tag = await service.findTagByName(guildId, tagName);
		} catch (error) {
			if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
				return replyEphemeral(interaction, SUPPORT_TAG_TABLE_MISSING_MESSAGE);
			}
			throw error;
		}

		// Validate tag exists
		if (!tag) {
			return replyEphemeral(interaction, 'The "no_response" tag does not exist. Please create it first using `/tag create`.');
		}

		// Build tag embed components with optional user mention
		const components = buildTagComponents(tag, user ? { id: user.id } : undefined);

		// Send tag to channel (public message)
		return interaction.reply({
			components,
			flags: MessageFlags.IsComponentsV2
		});
	}

	private async handleError(interaction: Command.ChatInputCommandInteraction, error: unknown) {
		this.container.logger.error('[no_response] Command failed', error, {
			guildId: interaction.guildId ?? 'dm',
			userId: interaction.user.id,
			interactionId: interaction.id
		});

		const payload = {
			content: 'I hit an error while processing the no_response command. Please try again.',
			ephemeral: true
		};

		if (interaction.replied || interaction.deferred) {
			return interaction.editReply({ content: payload.content }).catch((replyError) => {
				this.container.logger.error('[no_response] Failed to edit reply after error', replyError, {
					guildId: interaction.guildId ?? 'dm',
					userId: interaction.user.id,
					interactionId: interaction.id
				});
				return undefined;
			});
		}

		return interaction.reply(payload).catch((replyError) => {
			this.container.logger.error('[no_response] Failed to send reply after error', replyError, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			return undefined;
		});
	}
}
