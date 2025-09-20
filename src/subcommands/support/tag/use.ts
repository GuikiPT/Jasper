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

export async function chatInputTagUse(command: TagCommand, interaction: TagChatInputInteraction) {
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	const name = normalizeTagName(interaction.options.getString('name', true));
	const user = interaction.options.getUser('user');
	const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

	const access = await ensureTagChannelAccess(command, interaction);
	if (!access.allowed) {
		const message = formatTagChannelRestrictionMessage(access, {
			unconfigured:
				'Support tags cannot be used yet because no allowed channels have been configured. Use `/settings channel add` with the `allowedTagChannels` setting to choose where tags may be used.',
			single: (channel) => `Support tags may only be used in ${channel}.`,
			multiple: (channels) => `Support tags may only be used in the following channels: ${channels}.`
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

	const components = buildTagComponents(tag, user ? { id: user.id } : undefined);

	return interaction.reply({
		components,
		flags: ephemeral ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 : MessageFlags.IsComponentsV2
	});
}
