import { EmbedBuilder, MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	findTag,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeTagName,
	replyEphemeral,
	timestamp
} from './utils';

export async function chatInputTagInfo(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	const name = normalizeTagName(interaction.options.getString('name', true));
	let tag;
	try {
		tag = await findTag(command, guildId, name);
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return replyEphemeral(interaction, SUPPORT_TAG_TABLE_MISSING_MESSAGE);
		}
		throw error;
	}

	if (!tag) {
		return replyEphemeral(interaction, 'No tag with that name exists.');
	}

	const embed = new EmbedBuilder()
		.setTitle(`Tag: ${tag.name}`)
		.addFields(
			{ name: 'Author', value: `<@${tag.authorId}>`, inline: true },
			{ name: 'Created', value: timestamp(tag.createdAt), inline: true },
			{ name: 'Last Edited By', value: tag.editedBy ? `<@${tag.editedBy}>` : 'Never', inline: true },
			{ name: 'Updated', value: timestamp(tag.updatedAt), inline: true }
		)
		.setColor(0x5865f2);

	return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
