// Tag edit subcommand - displays modal for editing existing support tags
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

// Handle /tag edit name:<tag> - shows modal pre-filled with existing tag data
export async function chatInputTagEdit(command: TagCommand, interaction: TagChatInputInteraction) {
	// Validate guild context
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyWithComponents(interaction, 'This command can only be used inside a server.', true);
	}

	// Normalize and find tag
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

	// Validate tag exists
	if (!tag) {
		return replyWithComponents(interaction, 'No tag with that name exists.', true);
	}

	// Build modal with tag ID for submission handling
	const modalId = `${SUPPORT_TAG_EDIT_MODAL_ID_PREFIX}:${tag.id}`;
	const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Edit Tag: ${tag.name}`);

	// Tag name field (required, pre-filled)
	const nameInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_NAME)
		.setLabel('Tag Name')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(MAX_TAG_NAME_LENGTH)
		.setValue(tag.name);

	// Embed title field (required, pre-filled)
	const titleInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_TITLE)
		.setLabel('Embed Title')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(MAX_EMBED_TITLE_LENGTH)
		.setValue(tag.embedTitle);

	// Embed description field (optional, pre-filled if exists)
	const descriptionInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_DESCRIPTION)
		.setLabel('Embed Description (optional)')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_DESCRIPTION_LENGTH, 4_000));

	if (tag.embedDescription) {
		descriptionInput.setValue(tag.embedDescription);
	}

	// Image URL field (optional, pre-filled if exists)
	const imageInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_IMAGE)
		.setLabel('Image URL (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false);

	if (tag.embedImageUrl) {
		imageInput.setValue(tag.embedImageUrl);
	}

	// Footer text field (optional, pre-filled if exists)
	const footerInput = new TextInputBuilder()
		.setCustomId(SUPPORT_TAG_MODAL_FIELD_FOOTER)
		.setLabel('Footer (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setMaxLength(Math.min(MAX_EMBED_FOOTER_LENGTH, 4_000));

	if (tag.embedFooter) {
		footerInput.setValue(tag.embedFooter);
	}

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
