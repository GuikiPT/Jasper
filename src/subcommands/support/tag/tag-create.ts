// tag-create module within subcommands/support/tag
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import {
	MAX_EMBED_DESCRIPTION_LENGTH,
	MAX_EMBED_FOOTER_LENGTH,
	MAX_EMBED_TITLE_LENGTH,
	MAX_TAG_NAME_LENGTH,
	TagCommand,
	TagChatInputInteraction,
	replyWithComponents
} from './utils';
import {
	SUPPORT_TAG_CREATE_MODAL_ID,
	SUPPORT_TAG_MODAL_FIELD_DESCRIPTION,
	SUPPORT_TAG_MODAL_FIELD_FOOTER,
	SUPPORT_TAG_MODAL_FIELD_IMAGE,
	SUPPORT_TAG_MODAL_FIELD_NAME,
	SUPPORT_TAG_MODAL_FIELD_TITLE
} from './constants';

export async function chatInputTagCreate(_command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyWithComponents(interaction, 'This command can only be used inside a server.', true);
	}

	const modal = new ModalBuilder().setCustomId(SUPPORT_TAG_CREATE_MODAL_ID).setTitle('Create Support Tag');

	const nameInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_NAME)
		.setLabel('Tag Name')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('example')
		.setRequired(true)
		.setMaxLength(MAX_TAG_NAME_LENGTH);

	const titleInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_TITLE)
		.setLabel('Embed Title')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('Helpful Tag Title')
		.setRequired(true)
		.setMaxLength(MAX_EMBED_TITLE_LENGTH);

	const descriptionInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION)
		.setLabel('Embed Description (optional)')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_DESCRIPTION_LENGTH, 4_000));

	const imageInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_IMAGE)
		.setLabel('Image URL (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false);

	const footerInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_FOOTER)
		.setLabel('Footer (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_FOOTER_LENGTH, 4_000));

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput)
	);

	return interaction.showModal(modal);
}
