import { MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	buildTagEmbed,
	ensureTagChannelAccess,
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
		let message: string;
		if (access.reason === 'unconfigured') {
			message =
				'Support tags cannot be used yet because no allowed channels have been configured. Use `/settings channel add` with the `allowedTagChannels` setting to choose where tags may be used.';
		} else {
			const formatted = access.allowedChannels.map((id) => `<#${id}>`).join(', ');
			message =
				access.allowedChannels.length === 1
					? `Support tags may only be used in ${formatted}.`
					: `Support tags may only be used in the following channels: ${formatted}.`;
		}
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

	const embed = buildTagEmbed(tag);
	const content = user ? `<@${user.id}>` : undefined;

	return interaction.reply({ embeds: [embed], content, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
}
