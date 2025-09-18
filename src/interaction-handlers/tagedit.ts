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
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	isSupportTagPrismaTableMissingError,
	normalizeOptional,
	normalizeTagName,
	validateName,
	validateUrl
} from '../subcommands/support/tag/utils';

type ParsedEditModalData = {
	tagId: number;
};

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SupportTagEditModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		if (!interaction.customId.startsWith(`${SUPPORT_TAG_EDIT_MODAL_ID_PREFIX}:`)) {
			return this.none();
		}

		const [, rawId] = interaction.customId.split(':');
		const tagId = Number(rawId);

		if (!rawId || Number.isNaN(tagId)) {
			return this.none();
		}

		return this.some<ParsedEditModalData>({ tagId });
	}

	public async run(interaction: ModalSubmitInteraction, { tagId }: ParsedEditModalData) {
		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({
				content: 'This modal can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		const rawName = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_NAME).trim();
		const updatedName = normalizeTagName(rawName);
		const updatedTitle = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_TITLE).trim();
		const updatedDescription = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION));
		const updatedImage = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_IMAGE));
		const updatedFooter = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_FOOTER));

		if (!validateName(updatedName)) {
			return interaction.reply({
				content: 'Tag names must be alphanumeric and may include dashes or underscores.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (updatedTitle.length === 0) {
			return interaction.reply({
				content: 'Tag titles cannot be empty.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (updatedImage && !validateUrl(updatedImage)) {
			return interaction.reply({
				content: 'The image URL you provided is not valid.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		let tag;
		try {
			tag = await this.container.database.guildSupportTag.findUnique({
				where: { id: tagId }
			});
		} catch (error) {
			if (isSupportTagPrismaTableMissingError(error)) {
				return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		if (!tag || tag.guildId !== guildId) {
			return interaction.editReply({ content: 'The tag you tried to edit no longer exists.' });
		}

		if (updatedName !== tag.name) {
			try {
				const collision = await this.container.database.guildSupportTag.findFirst({
					where: { guildId, name: updatedName }
				});

				if (collision && collision.id !== tag.id) {
					return interaction.editReply({ content: `A different tag named **${collision.name}** already exists.` });
				}
			} catch (error) {
				if (isSupportTagPrismaTableMissingError(error)) {
					return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
				}
				throw error;
			}
		}

		try {
			const updated = await this.container.database.guildSupportTag.update({
				where: { id: tag.id },
				data: {
					name: updatedName,
					embedTitle: updatedTitle,
					embedDescription: updatedDescription,
					embedFooter: updatedFooter,
					embedImageUrl: updatedImage,
					editedBy: interaction.user.id
				}
			});

			return interaction.editReply({ content: `Updated tag **${updated.name}**.` });
		} catch (error) {
			if (isSupportTagPrismaTableMissingError(error)) {
				return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
			}
			this.container.logger.error('Failed to update support tag', error);
			return interaction.editReply({ content: 'Unable to update the tag right now. Please try again later.' });
		}
	}
}
