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

export async function chatInputTagShow(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	const name = normalizeTagName(interaction.options.getString('name', true));
	const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
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

	const components = buildTagComponents(tag);

	if (ephemeral) {
		return interaction.reply({ components, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
	}

	return interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
}
