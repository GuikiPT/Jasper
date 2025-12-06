// Tag show subcommand - previews tag embed with optional ephemeral display
import { MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	buildTagComponents,
	ensureTagChannelAccess,
	formatTagChannelRestrictionMessage,
	findTag,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	normalizeTagName,
	replyEphemeral
} from './utils';

// Handle /tag show name:<tag> [ephemeral] - previews tag embed
export async function chatInputTagShow(command: TagCommand, interaction: TagChatInputInteraction) {
	// Validate guild context
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	// Get options
	const name = normalizeTagName(interaction.options.getString('name', true));
	const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;

	// Check channel restrictions
	const access = await ensureTagChannelAccess(command, interaction);
	if (!access.allowed) {
		const message = formatTagChannelRestrictionMessage(access, {
			unconfigured:
				'Support tags cannot be previewed yet because no allowed channels have been configured. Use `/settings channels add` with the `allowedTagChannels` setting to choose where previews may be shown.',
			single: (channel) => `Support tags may only be previewed in ${channel}.`,
			multiple: (channels) => `Support tags may only be previewed in the following channels: ${channels}.`
		});
		return replyEphemeral(interaction, message);
	}

	// Normalize and find tag
	let tag;
	try {
		tag = await findTag(command, guildId, name);
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return replyEphemeral(interaction, SUPPORT_TAG_TABLE_MISSING_MESSAGE);
		}
		throw error;
	}

	// Validate tag exists
	if (!tag) {
		return replyEphemeral(interaction, 'No tag with that name exists.');
	}

	// Build tag embed components
	const components = buildTagComponents(tag);

	// Send as ephemeral or public based on option
	if (ephemeral) {
		return interaction.reply({ components, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
	}

	return interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
}
