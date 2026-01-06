// is_done command - quick access to the "done" tag
import { ApplyOptions } from '@sapphire/decorators';
import { Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags
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
	name: 'is_done',
	description: 'Send the "done" tag to the current channel.',
	detailedDescription: {
		summary: 'Quick access command to send the predefined "done" support tag.',
		chatInputUsage: '/is_done',
		notes: [
			'This command uses the predefined "done" tag from the database.',
			'Requires an allowed tag role, staff role, or admin role.',
			'Automatically mentions the thread starter when used in a thread.'
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
export class IsDoneCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
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

		// Get thread OP if in a thread
		const channel = interaction.channel;
		if (!channel) {
			return replyEphemeral(interaction, 'Could not access the channel. Please try again.');
		}

		let threadOpId: string | undefined;
		if (channel.isThread()) {
			threadOpId = channel.ownerId ?? undefined;
		}

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

		// Find the "done" tag
		const tagName = normalizeTagName('done');
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
			return replyEphemeral(interaction, 'The "done" tag does not exist. Please create it first using `/tag create`.');
		}

		// Build tag embed components with thread OP mention
		const components = buildTagComponents(tag, threadOpId ? { id: threadOpId } : undefined);

		// Send tag to channel (public message)
		return interaction.reply({
			components,
			flags: MessageFlags.IsComponentsV2
		});
	}

	private async handleError(interaction: Command.ChatInputCommandInteraction, error: unknown) {
		// Determine error message based on error type
		let errorMessage = 'An unexpected error occurred while processing the command. Please try again.';
		let logLevel: 'error' | 'warn' = 'error';

		if (error instanceof Error) {
			// Handle specific Discord API errors
			if ('code' in error) {
				const code = (error as any).code;
				switch (code) {
					case 50001: // Missing Access
						errorMessage = 'I don\'t have permission to access this channel.';
						logLevel = 'warn';
						break;
					case 50013: // Missing Permissions
						errorMessage = 'I don\'t have the required permissions to send messages in this channel.';
						logLevel = 'warn';
						break;
					case 10003: // Unknown Channel
						errorMessage = 'This channel no longer exists or I cannot access it.';
						logLevel = 'warn';
						break;
					case 10008: // Unknown Message
						errorMessage = 'The message could not be found.';
						logLevel = 'warn';
						break;
				}
			}
		}

		this.container.logger[logLevel]('[is_done] Command failed', error, {
			guildId: interaction.guildId ?? 'dm',
			userId: interaction.user.id,
			interactionId: interaction.id,
			channelId: interaction.channelId,
			errorType: error instanceof Error ? error.constructor.name : typeof error
		});

		const payload = {
			content: errorMessage,
			ephemeral: true
		};

		if (interaction.replied || interaction.deferred) {
			return interaction.editReply({ content: payload.content }).catch((replyError) => {
				this.container.logger.error('[is_done] Failed to edit reply after error', replyError, {
					guildId: interaction.guildId ?? 'dm',
					userId: interaction.user.id,
					interactionId: interaction.id
				});
				return undefined;
			});
		}

		return interaction.reply(payload).catch((replyError) => {
			this.container.logger.error('[is_done] Failed to send reply after error', replyError, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			return undefined;
		});
	}
}
