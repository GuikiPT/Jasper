// tag-edit module within subcommands/support/tag
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import {
	MAX_EMBED_DESCRIPTION_LENGTH,
	MAX_EMBED_FOOTER_LENGTH,
	MAX_EMBED_TITLE_LENGTH,
	MAX_TAG_NAME_LENGTH,
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	findTag,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeTagName,
	replyWithComponents
} from './utils';
import {
	SUPPORT_TAG_EDIT_MODAL_ID_PREFIX,
	SUPPORT_TAG_MODAL_FIELD_DESCRIPTION,
	SUPPORT_TAG_MODAL_FIELD_FOOTER,
	SUPPORT_TAG_MODAL_FIELD_IMAGE,
	SUPPORT_TAG_MODAL_FIELD_NAME,
	SUPPORT_TAG_MODAL_FIELD_TITLE
} from './constants';

export async function chatInputTagEdit(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyWithComponents(interaction, 'This command can only be used inside a server.', true);
	}

	const name = normalizeTagName(interaction.options.getString('name', true));
	let tag;
	try {
		tag = await findTag(command, guildId, name);
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return replyWithComponents(interaction, SUPPORT_TAG_TABLE_MISSING_MESSAGE, true);
		}
		throw error;
	}

	if (!tag) {
		return replyWithComponents(interaction, 'No tag with that name exists.', true);
	}

	const modalId = `${SUPPORT_TAG_EDIT_MODAL_ID_PREFIX}:${tag.id}`;

	const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Edit Tag: ${tag.name}`);

	const nameInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_NAME)
		.setLabel('Tag Name')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(MAX_TAG_NAME_LENGTH)
		.setValue(tag.name);

	const titleInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_TITLE)
		.setLabel('Embed Title')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(MAX_EMBED_TITLE_LENGTH)
		.setValue(tag.embedTitle);

	const descriptionInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION)
		.setLabel('Embed Description (optional)')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_DESCRIPTION_LENGTH, 4_000));

	if (tag.embedDescription) {
		descriptionInput.setValue(tag.embedDescription);
	}

	const imageInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_IMAGE)
		.setLabel('Image URL (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false);

	if (tag.embedImageUrl) {
		imageInput.setValue(tag.embedImageUrl);
	}

	const footerInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_FOOTER)
		.setLabel('Footer (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_FOOTER_LENGTH, 4_000));

	if (tag.embedFooter) {
		footerInput.setValue(tag.embedFooter);
	}

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput)
	);

	return interaction.showModal(modal);
}
