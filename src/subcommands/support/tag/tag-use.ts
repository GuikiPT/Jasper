// Tag use subcommand - sends tag embed to channel with optional user mention
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

// Handle /tag use name:<tag> [user] - sends tag to channel
export async function chatInputTagUse(command: TagCommand, interaction: TagChatInputInteraction) {
    // Validate guild context
    const guildId = interaction.guildId;
    if (!guildId) {
        return replyEphemeral(interaction, 'This command can only be used inside a server.');
    }

    // Get options
    const name = normalizeTagName(interaction.options.getString('name', true));
    const user = interaction.options.getUser('user');

    // Check channel restrictions
    const access = await ensureTagChannelAccess(command, interaction);
    if (!access.allowed) {
        const message = formatTagChannelRestrictionMessage(access, {
            unconfigured:
                'Support tags cannot be used yet because no allowed channels have been configured. Use `/settings channels add` with the `allowedTagChannels` setting to choose where tags may be used.',
            single: (channel) => `Support tags may only be used in ${channel}.`,
            multiple: (channels) => `Support tags may only be used in the following channels: ${channels}.`
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

    // Build tag embed components with optional user mention
    const components = buildTagComponents(tag, user ? { id: user.id } : undefined);

    // Send tag to channel (public message)
    return interaction.reply({
        components,
        flags: MessageFlags.IsComponentsV2
    });
}
