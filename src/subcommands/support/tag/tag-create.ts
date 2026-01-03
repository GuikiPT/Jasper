// Tag create subcommand - displays modal for creating new support tags
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

// Handle /tag create - shows modal for capturing tag details
export async function chatInputTagCreate(_command: TagCommand, interaction: TagChatInputInteraction) {
	// Validate guild context
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyWithComponents(interaction, 'This command can only be used inside a server.', true);
	}

	// Build modal for tag creation
	const modal = new ModalBuilder().setCustomId(SUPPORT_TAG_CREATE_MODAL_ID).setTitle('Create Support Tag');

	// Tag name field (required)
	const nameInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_NAME)
		.setLabel('Tag Name')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('example')
		.setRequired(true)
		.setMaxLength(MAX_TAG_NAME_LENGTH);

	// Embed title field (required)
	const titleInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_TITLE)
		.setLabel('Embed Title')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('Helpful Tag Title')
		.setRequired(true)
		.setMaxLength(MAX_EMBED_TITLE_LENGTH);

	// Embed description field (optional)
	const descriptionInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION)
		.setLabel('Embed Description (optional)')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_DESCRIPTION_LENGTH, 4_000));

	// Image URL field (optional)
	const imageInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_IMAGE)
		.setLabel('Image URL (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false);

	// Footer text field (optional)
	const footerInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_FOOTER)
		.setLabel('Footer (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_FOOTER_LENGTH, 4_000));

	// Add all fields to modal
	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput)
	);

	// Display modal to user
	return interaction.showModal(modal);
}
