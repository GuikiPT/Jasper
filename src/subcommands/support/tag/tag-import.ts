// Tag import subcommand - imports tags from JSON file or text
import { MessageFlags } from 'discord.js';
import { FetchResultTypes, fetch } from '@sapphire/fetch';
import type { Attachment } from 'discord.js';

import {
    NormalizedImportEntry,
    SUPPORT_TAG_TABLE_MISSING_MESSAGE,
    TagCommand,
    TagChatInputInteraction,
    isSupportTagPrismaTableMissingError,
    isSupportTagTableMissingError,
    normalizeImportEntry,
    replyEphemeral
} from './utils';

const MAX_IMPORT_FILE_SIZE = 512_000; // 500KB
const MAX_TAGS_PER_IMPORT = 100;

// Handle /tag import [file|payload] [overwrite] - imports tags from JSON
export async function chatInputTagImport(command: TagCommand, interaction: TagChatInputInteraction) {
    // Validate guild context
    const guildId = interaction.guildId;
    if (!guildId) {
        return replyEphemeral(interaction, 'This command can only be used inside a server.');
    }

    // Get import source and options
    const attachment = interaction.options.getAttachment('file') ?? null;
    const payloadText = interaction.options.getString('payload');
    const overwrite = interaction.options.getBoolean('overwrite') ?? false;

    // Resolve payload from file or text
    let payload: string | null;
    try {
        payload = await resolvePayload({ attachment, fallback: payloadText });
    } catch (error) {
        return replyEphemeral(interaction, formatPayloadError(error));
    }

    if (!payload) {
        return replyEphemeral(interaction, 'Provide a JSON attachment or paste JSON data containing tags to import.');
    }

    // Parse JSON payload
    let parsed: unknown;
    try {
        parsed = JSON.parse(payload);
    } catch (error) {
        command.container.logger.warn('Support tag import failed to parse JSON', error);
        return replyEphemeral(interaction, 'The payload is not valid JSON.');
    }

    // Handle both array format (legacy) and object format
    let entries: NormalizedImportEntry[] = [];

    if (Array.isArray(parsed)) {
        // Legacy array format: [{name, title, ...}, ...]
        if (parsed.length === 0) {
            return replyEphemeral(interaction, 'The payload must be a non-empty JSON array.');
        }

        for (const raw of parsed) {
            const normalized = normalizeImportEntry(raw);
            if (!normalized.ok) {
                return replyEphemeral(interaction, `Invalid tag entry encountered: ${normalized.reason}`);
            }
            entries.push(normalized.value);
        }
    } else if (typeof parsed === 'object' && parsed !== null) {
        // Object format: {tagName: {title, description, ...}, ...}
        const tagObject = parsed as Record<string, unknown>;

        for (const [tagName, tagData] of Object.entries(tagObject)) {
            if (typeof tagData !== 'object' || tagData === null) {
                return replyEphemeral(interaction, `Invalid tag data for "${tagName}": must be an object.`);
            }

            // Convert object format to normalized format
            const tagDataObj = tagData as Record<string, unknown>;
            const normalized = normalizeImportEntry({
                name: tagName,
                title: tagDataObj.title,
                description: tagDataObj.description,
                footer: tagDataObj.footer,
                image: tagDataObj.imageUrl,
                authorId: tagDataObj.authorId,
                editedBy: tagDataObj.editedBy
            });

            if (!normalized.ok) {
                return replyEphemeral(interaction, `Invalid tag entry for "${tagName}": ${normalized.reason}`);
            }
            entries.push(normalized.value);
        }
    } else {
        return replyEphemeral(interaction, 'The payload must be a JSON array or object containing tag data.');
    }

    // Validate entries exist
    if (entries.length === 0) {
        return replyEphemeral(interaction, 'No valid tags found in the provided data.');
    }

    // Enforce import limit
    if (entries.length > MAX_TAGS_PER_IMPORT) {
        entries = entries.slice(0, MAX_TAGS_PER_IMPORT);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Get support tag service
    const service = command.container.supportTagService;
    if (!service) {
        command.container.logger.error('Support tag service is not initialised');
        return interaction.editReply({ content: 'Support tags are not available right now. Please try again later.' });
    }

    // Import tags into database
    try {
        const summary = await service.importTags(guildId, entries, {
            overwrite,
            actorId: interaction.user.id
        });

        // Build success message based on mode
        const suffix = overwrite
            ? `Imported ${summary.created} tag${summary.created === 1 ? '' : 's'}.`
            : `Imported ${summary.created} new tag${summary.created === 1 ? '' : 's'} and updated ${summary.updated} existing.`;

        return interaction.editReply({ content: suffix });
    } catch (error) {
        if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
            return interaction.editReply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE });
        }
        command.container.logger.error('Failed to import support tags', error);
        return interaction.editReply({ content: 'Unable to import tags right now. Please try again later.' });
    }
}

// Resolve payload from attachment or fallback text
async function resolvePayload({ attachment, fallback }: { attachment: Attachment | null; fallback: string | null }): Promise<string | null> {
    if (attachment) {
        // Validate file size
        if (attachment.size && attachment.size > MAX_IMPORT_FILE_SIZE) {
            throw new Error(`Attachment exceeds the ${Math.floor(MAX_IMPORT_FILE_SIZE / 1024)}KB limit.`);
        }

        const url = attachment.url;
        if (!url) {
            throw new Error('Could not read the provided attachment.');
        }

        // Validate content type
        const contentType = attachment.contentType ?? '';
        if (contentType && !contentType.includes('json') && !contentType.includes('text')) {
            throw new Error('Attachment must be a JSON or text file.');
        }

        // Download attachment content
        return fetch(url, FetchResultTypes.Text);
    }

    return fallback;
}

// Format payload resolution errors for user display
function formatPayloadError(error: unknown) {
    if (error instanceof Error) return error.message;
    return 'Failed to read the provided payload. Please try again.';
}
