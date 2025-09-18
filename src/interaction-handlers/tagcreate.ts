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
	isSupportTagPrismaTableMissingError,
	normalizeOptional,
	normalizeTagName,
	validateName,
	validateUrl
} from '../subcommands/support/tag/utils';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SupportTagCreateModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		if (interaction.customId !== SUPPORT_TAG_CREATE_MODAL_ID) {
			return this.none();
		}

		return this.some();
	}

	public async run(interaction: ModalSubmitInteraction) {
		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({
				content: 'This modal can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		const rawName = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_NAME).trim();
		const name = normalizeTagName(rawName);
		const title = interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_TITLE).trim();
		const description = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION));
		const image = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_IMAGE));
		const footer = normalizeOptional(interaction.fields.getTextInputValue(SUPPORT_TAG_MODAL_FIELD_FOOTER));

		if (!validateName(name)) {
			return interaction.reply({
				content: 'Tag names must be alphanumeric and may include dashes or underscores.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (title.length === 0) {
			return interaction.reply({
				content: 'Tag titles cannot be empty.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (image && !validateUrl(image)) {
			return interaction.reply({
				content: 'The image URL you provided is not valid.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			const existing = await this.container.database.guildSupportTag.findFirst({
				where: { guildId, name }
			});

			if (existing) {
				return interaction.editReply({ content: `A tag named **${existing.name}** already exists.` });
			}
		} catch (error) {
			if (isSupportTagPrismaTableMissingError(error)) {
				return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		try {
			const tag = await this.container.database.guildSupportTag.create({
				data: {
					guildId,
					name,
					authorId: interaction.user.id,
					editedBy: null,
					embedTitle: title,
					embedDescription: description,
					embedFooter: footer,
					embedImageUrl: image
				}
			});

			return interaction.editReply({ content: `Created tag **${tag.name}**.` });
		} catch (error) {
			if (isSupportTagPrismaTableMissingError(error)) {
				return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
			}
			this.container.logger.error('Failed to create support tag', error);
			return interaction.editReply({ content: 'Unable to create the tag right now. Please try again later.' });
		}
	}
}
