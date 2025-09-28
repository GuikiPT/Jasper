// tag-delete module within subcommands/support/tag
import { MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	findTag,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeTagName,
	replyEphemeral
} from './utils';

export async function chatInputTagDelete(command: TagCommand, interaction: TagChatInputInteraction) {
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

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const service = command.container.supportTagService;
	if (!service) {
		command.container.logger.error('Support tag service is not initialised');
		return interaction.editReply({ content: 'Support tags are not available right now. Please try again later.' });
	}

	try {
		await service.deleteTag(tag.id);
		return interaction.editReply({ content: `Deleted tag **${tag.name}**.` });
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
		}
		command.container.logger.error('Failed to delete support tag', error);
		return interaction.editReply({ content: 'Unable to delete the tag right now. Please try again later.' });
	}
}
