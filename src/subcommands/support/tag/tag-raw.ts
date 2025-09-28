// tag-raw module within subcommands/support/tag
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

export async function chatInputTagRaw(command: TagCommand, interaction: TagChatInputInteraction) {
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

	const raw = JSON.stringify(
		{
			title: tag.embedTitle,
			description: tag.embedDescription,
			footer: tag.embedFooter,
			image: tag.embedImageUrl
		},
		null,
		2
	);

	const payload = raw.length > 1_900 ? 'Payload too large to display.' : `\`\`\`json\n${raw}\n\`\`\``;

	return replyEphemeral(interaction, payload);
}
