// Tag edit modal handler - processes tag update form submission
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';

import {
	SUPPORT_TAG_EDIT_MODAL_ID_PREFIX,
	SUPPORT_TAG_MODAL_FIELD_DESCRIPTION,
	SUPPORT_TAG_MODAL_FIELD_FOOTER,
	SUPPORT_TAG_MODAL_FIELD_IMAGE,
	SUPPORT_TAG_MODAL_FIELD_NAME,
	SUPPORT_TAG_MODAL_FIELD_TITLE
} from '../subcommands/support/tag/constants';
import {
	SUPPORT_ROLE_REQUIRED_MESSAGE,
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	ensureSupportRoleAccess,
	ensureTagChannelAccess,
	formatTagChannelRestrictionMessage,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeOptional,
	normalizeTagName,
	validateName,
	validateUrl
} from '../subcommands/support/tag/utils';
import { SupportTagDuplicateNameError } from '../services/supportTagService';

// Parsed modal metadata containing tag ID
type ParsedEditModalData = {
	tagId: number;
};

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SupportTagEditModalHandler extends InteractionHandler {
	// Parse modal custom ID and extract tag ID
	public override parse(interaction: ModalSubmitInteraction) {
		try {
			// Expected format: prefix:tagId
			if (!interaction.customId.startsWith(`${SUPPORT_TAG_EDIT_MODAL_ID_PREFIX}:`)) {
				return this.none();
			}

			const [, rawId] = interaction.customId.split(':');
			const tagId = Number(rawId);

			if (!rawId || Number.isNaN(tagId)) {
				return this.none();
			}

			return this.some<ParsedEditModalData>({ tagId });
		} catch (error) {
			this.container.logger.error('Failed to parse support tag edit modal interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id,
				customId: interaction.customId
			});
			return this.none();
		}
	}

	// Handle modal submission and update existing tag
	public async run(interaction: ModalSubmitInteraction, { tagId }: ParsedEditModalData) {
		try {
			// Validate guild context
			const guildId = interaction.guildId;
			if (!guildId) {
				return interaction.reply({
					content: 'This modal can only be used inside a server.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Verify user has support role access
			const supportAccess = await ensureSupportRoleAccess(this, interaction);
			if (!supportAccess.allowed) {
				return interaction.reply({ content: SUPPORT_ROLE_REQUIRED_MESSAGE, flags: MessageFlags.Ephemeral });
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

			// Extract and normalize updated field values
			const rawName = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_NAME).trim();
			const updatedName = normalizeTagName(rawName);
			const updatedTitle = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_TITLE).trim();
			const updatedDescription = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION));
			const updatedImage = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_IMAGE));
			const updatedFooter = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_FOOTER));

			// Validate tag name format
			if (!validateName(updatedName)) {
				return interaction.reply({
					content: 'Tag names must be alphanumeric and may include dashes or underscores.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Validate title is not empty
			if (updatedTitle.length === 0) {
				return interaction.reply({
					content: 'Tag titles cannot be empty.',
					flags: MessageFlags.Ephemeral
				});
			}

			// Validate image URL if provided
			if (updatedImage && !validateUrl(updatedImage)) {
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

			// Fetch existing tag by ID
			let tag;
			try {
				tag = await service.findTagById(tagId);
			} catch (error) {
				if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
					return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
				}
				throw error;
			}

			// Verify tag exists and belongs to current guild
			if (!tag || tag.guildId !== guildId) {
				return interaction.editReply({ content: 'The tag you tried to edit no longer exists.' });
			}

			// Check for name collision if name changed
			if (updatedName !== tag.name) {
				try {
					const collision = await service.findTagByName(guildId, updatedName);

					if (collision && collision.id !== tag.id) {
						return interaction.editReply({ content: `A different tag named **${collision.name}** already exists.` });
					}
				} catch (error) {
					if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
						return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
					}
					throw error;
				}
			}

			// Update tag in database
			try {
				const updated = await service.updateTag(tag.id, {
					name: updatedName,
					embedTitle: updatedTitle,
					embedDescription: updatedDescription,
					embedFooter: updatedFooter,
					embedImageUrl: updatedImage,
					editedBy: interaction.user.id
				});

				const reply = await interaction.editReply({ content: `Updated tag **${updated.name}**.` });

				this.container.logger.debug('[SupportTagEditModal] Updated tag', {
					guildId,
					userId: interaction.user.id,
					tagId: updated.id,
					oldName: tag.name,
					newName: updated.name,
					interactionId: interaction.id
				});

				return reply;
			} catch (error) {
				if (error instanceof SupportTagDuplicateNameError) {
					return interaction.editReply({ content: 'A different tag with that name already exists.' });
				}
				if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
					return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
				}
				this.container.logger.error('Failed to update support tag', error);
				return interaction.editReply({ content: 'Unable to update the tag right now. Please try again later.' });
			}
		}
		catch (error) {
			this.container.logger.error('Failed to process support tag edit modal interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id,
				tagId
			});
			return interaction.reply({
				content: 'I could not process your tag edit right now. Please try again later.',
				flags: MessageFlags.Ephemeral
			});
		}
	}
}
