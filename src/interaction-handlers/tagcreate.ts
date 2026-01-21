// Tag create modal handler - processes tag creation form submission
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';

import {
	SUPPORT_TAG_CREATE_MODAL_ID,
	SUPPORT_TAG_MODAL_FIELD_DESCRIPTION,
	SUPPORT_TAG_MODAL_FIELD_FOOTER,
	SUPPORT_TAG_MODAL_FIELD_IMAGE,
	SUPPORT_TAG_MODAL_FIELD_NAME,
	SUPPORT_TAG_MODAL_FIELD_TITLE
} from '../subcommands/support/tag/constants';
import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TAG_MANAGEMENT_ROLE_REQUIRED_MESSAGE,
	ensureTagChannelAccess,
	ensureTagManagementRoleAccess,
	formatTagChannelRestrictionMessage,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeOptional,
	normalizeTagName,
	validateName,
	validateUrl
} from '../subcommands/support/tag/utils';
import { SupportTagDuplicateNameError } from '../services/supportTagService';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SupportTagCreateModalHandler extends InteractionHandler {
	// Parse modal custom ID to check if this handler should process it
	public override parse(interaction: ModalSubmitInteraction) {
		try {
			if (interaction.customId !== SUPPORT_TAG_CREATE_MODAL_ID) {
				return this.none();
			}

			return this.some();
		} catch (error) {
			this.container.logger.error('Failed to parse support tag create modal interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id
			});
			return this.none();
		}
	}

	// Handle modal submission and create new tag
	public async run(interaction: ModalSubmitInteraction) {
		try {
			// Validate guild context
			const guildId = interaction.guildId;
			if (!guildId) {
				return interaction.reply({
					content: 'This modal can only be used inside a server.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Extract and normalize field values
			const rawName = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_NAME).trim();
			const name = normalizeTagName(rawName);
			const title = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_TITLE).trim();
			const description = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION));
			const image = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_IMAGE));
			const footer = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_FOOTER));

			// Verify user has tag management role access (tag role, staff role, or admin role)
			const roleAccess = await ensureTagManagementRoleAccess(this, interaction);
			if (!roleAccess.allowed) {
				return interaction.reply({ content: TAG_MANAGEMENT_ROLE_REQUIRED_MESSAGE, flags: MessageFlags.Ephemeral });
			}

			// Verify channel access restrictions
			const channelAccess = await ensureTagChannelAccess(this, interaction);
			if (!channelAccess.allowed) {
				const message = formatTagChannelRestrictionMessage(channelAccess, {
					unconfigured:
						'Support tags cannot be managed yet because no allowed channels have been configured. Use `/settings channels add` with the `allowedTagChannels` setting to choose where they may be managed.',
					single: (channel) => `Support tags may only be managed in ${channel}.`,
					multiple: (channels) => `Support tags may only be managed in the following channels: ${channels}.`
				});
				return interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
			}

			// Validate tag name format
			if (!validateName(name)) {
				return interaction.reply({
					content: 'Tag names must be alphanumeric and may include dashes or underscores.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Validate title is not empty
			if (title.length === 0) {
				return interaction.reply({
					content: 'Tag titles cannot be empty.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Validate image URL if provided
			if (image && !validateUrl(image)) {
				return interaction.reply({
					content: 'The image URL you provided is not valid.',
					flags: MessageFlags.Ephemeral
				});
			}

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			// Get support tag service
			const service = this.container.supportTagService;
			if (!service) {
				this.container.logger.error('Support tag service is not initialised');
				return interaction.editReply({ content: 'Support tags are not available right now. Please try again later.' });
			}

			// Check if tag with same name already exists
			try {
				const existing = await service.findTagByName(guildId, name);

				if (existing) {
					return interaction.editReply({ content: `A tag named **${existing.name}** already exists.` });
				}
			} catch (error) {
				if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
					return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
				}
				throw error;
			}

			// Create new tag in database
			try {
				const tag = await service.createTag(guildId, {
					name,
					authorId: interaction.user.id,
					editedBy: null,
					embedTitle: title,
					embedDescription: description,
					embedFooter: footer,
					embedImageUrl: image
				});

				const reply = await interaction.editReply({ content: `Created tag **${tag.name}**.` });

				this.container.logger.debug('[SupportTagCreateModal] Created tag', {
					guildId,
					userId: interaction.user.id,
					tagId: tag.id,
					tagName: tag.name,
					interactionId: interaction.id
				});

				return reply;
			} catch (error) {
				if (error instanceof SupportTagDuplicateNameError) {
					return interaction.editReply({ content: 'A tag with that name already exists.' });
				}
				if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
					return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
				}
				this.container.logger.error('Failed to create support tag', error);
				return interaction.editReply({ content: 'Unable to create the tag right now. Please try again later.' });
			}
		} catch (error) {
			this.container.logger.error('Failed to process support tag create modal interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id
			});
			const fallbackFlags = MessageFlags.Ephemeral;
			if (interaction.deferred || interaction.replied) {
				return interaction
					.editReply({ content: 'I could not create the tag right now. Please try again later.' })
					.catch(() => this.container.logger.error('Failed to edit reply after support tag create modal failure', error));
			}
			return interaction
				.reply({ content: 'I could not create the tag right now. Please try again later.', flags: fallbackFlags })
				.catch(() => this.container.logger.error('Failed to send reply after support tag create modal failure', error));
		}
	}
}
