// Snipe manager - Tracks recently deleted messages for retrieval
import type { PrismaClient } from '@prisma/client';
import type { SapphireClient } from '@sapphire/framework';
import type { Message, PartialMessage, GuildMember, APIInteractionGuildMember } from 'discord.js';
import { parseJsonStringArray } from '../lib/utils';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Deleted message data stored for sniping
 */
export interface SnipedMessage {
    id: string;
    content: string;
    author: {
        id: string;
        username: string;
        discriminator: string;
        displayName: string;
        avatarURL: string | null;
    };
    channel: {
        id: string;
        name: string;
    };
    guild: {
        id: string;
        name: string;
    };
    attachments: Array<{
        id: string;
        name: string;
        url: string;
        proxyURL: string;
        size: number;
    }>;
    embeds: Array<{
        title?: string;
        description?: string;
        url?: string;
    }>;
    deletedAt: Date;
    createdAt: Date;
}

/**
 * Guild-level snipe state tracking
 */
interface GuildSnipeState {
    messages: Map<string, SnipedMessage>; // channelId -> last deleted message
}

// ============================================================
// Constants
// ============================================================

const MESSAGE_RETENTION_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 30_000; // 30 seconds
const IGNORE_TTL_MS = 60_000; // 1 minute
const COMMAND_PREFIX = 'j!'; // Common bot prefix to ignore

/**
 * Manager for tracking and retrieving recently deleted messages
 * - Stores last deleted message per channel
 * - Respects channel and role permissions
 * - Automatically expires old messages
 * - Prevents snipe of bot messages and commands
 * - Time-limited retention (5 minutes)
 */
export class SnipeManager {
    private readonly guildStates = new Map<string, GuildSnipeState>();
    private readonly ignoredDeletionIds = new Set<string>();
    private readonly MESSAGE_RETENTION_MS = MESSAGE_RETENTION_MS;

    public constructor(
        private readonly client: SapphireClient,
        private readonly database: PrismaClient
    ) {
        // Clean up expired messages periodically
        setInterval(() => this.cleanupOldMessages(), CLEANUP_INTERVAL_MS);
    }

    // ============================================================
    // Message Deletion Handling
    // ============================================================

    /**
     * Handles message deletion events
     * - Checks channel allowlist
     * - Verifies author doesn't have ignored roles
     * - Filters out bot messages and commands
     * - Stores message for snipe command
     * 
     * @param message Deleted message (may be partial)
     */
    public async handleMessageDelete(message: Message | PartialMessage) {
        try {
            // Require guild context
            if (!message.guildId || !message.guild) return;

            // Skip explicitly ignored deletions (e.g., bot-triggered)
            if (message.id && this.ignoredDeletionIds.has(message.id)) {
                this.ignoredDeletionIds.delete(message.id);
                this.client.logger.debug('[Snipe] Ignored deletion for message id', { messageId: message.id });
                return;
            }

            // Skip command-like messages
            const content = message.content ? String(message.content).trim() : '';
            if (content && content.startsWith(COMMAND_PREFIX)) {
                this.client.logger.debug('[Snipe] Ignored deletion for command-like message', { 
                    guildId: message.guildId, 
                    channelId: message.channelId 
                });
                return;
            }

            // Skip bot messages and empty messages
            if (message.author?.bot) return;
            if (!message.content && !message.attachments?.size && !message.embeds?.length) return;

            // Verify channel is in allowlist
            const isChannelAllowed = await this.isChannelAllowed(message.guildId, message.channelId);
            if (!isChannelAllowed) {
                this.client.logger.debug('[Snipe] Message deleted in non-allowed channel', {
                    guildId: message.guildId,
                    channelId: message.channelId
                });
                return;
            }

            // Skip if author has ignored snipe roles
            if (message.member) {
                const hasIgnoredRole = await this.hasIgnoredSnipeRoles(message.guildId, message.member);
                if (hasIgnoredRole) {
                    this.client.logger.debug('[Snipe] Message author has ignored snipe role', {
                        guildId: message.guildId,
                        authorId: message.author?.id,
                        channelId: message.channelId
                    });
                    return;
                }
            }

            // Store the deleted message
            if (message.author && message.channel && message.guild) {
                const snipedMessage = this.buildSnipedMessage(message);
                const guildState = this.getOrCreateGuildState(message.guildId);
                guildState.messages.set(message.channelId, snipedMessage);

                this.client.logger.debug('[Snipe] Message stored for sniping', {
                    guildId: message.guildId,
                    channelId: message.channelId,
                    messageId: message.id,
                    authorId: message.author.id
                });
            }
        } catch (error) {
            this.client.logger.error('[Snipe] Unhandled error during message delete handling', error, {
                guildId: message.guildId,
                channelId: message.channelId,
                messageId: message.id
            });
        }
    }

    // ============================================================
    // Message Retrieval
    // ============================================================

    /**
     * Retrieves the last deleted message for a channel
     * - Returns null if no message or expired
     * - Automatically removes expired messages
     * 
     * @param guildId Guild ID
     * @param channelId Channel ID
     * @returns Sniped message or null
     */
    public getLastDeletedMessage(guildId: string, channelId: string): SnipedMessage | null {
        const guildState = this.guildStates.get(guildId);
        if (!guildState) return null;

        const message = guildState.messages.get(channelId);
        if (!message) return null;

        // Check message hasn't expired
        const now = new Date();
        const timeSinceDeleted = now.getTime() - message.deletedAt.getTime();

        if (timeSinceDeleted > this.MESSAGE_RETENTION_MS) {
            guildState.messages.delete(channelId);
            return null;
        }

        return message;
    }

    // ============================================================
    // Deletion Ignore List
    // ============================================================

    /**
     * Marks a message ID to be ignored when deleted
     * - Used to prevent snipe of command invocations
     * - Automatically expires after TTL
     * 
     * @param messageId Message ID to ignore
     * @param ttl Time to live in milliseconds (default: 60s)
     */
    public ignoreMessageDeletion(messageId: string, ttl = IGNORE_TTL_MS) {
        if (!messageId) return;
        this.ignoredDeletionIds.add(messageId);
        setTimeout(() => this.ignoredDeletionIds.delete(messageId), ttl);
    }

    // ============================================================
    // Permission Checks
    // ============================================================

    /**
     * Checks if user has permission to use snipe command
     * - Requires staff or admin roles
     * 
     * @param guildId Guild ID
     * @param member Member to check
     * @returns True if member can use snipe
     */
    public async canUseSnipe(guildId: string, member: GuildMember | APIInteractionGuildMember): Promise<boolean> {
        try {
            const settings = await this.database.guildRoleSettings.findUnique({
                where: { guildId }
            });

            if (!settings) return false;

            const staffRoles = parseJsonStringArray(settings.allowedStaffRoles);
            const adminRoles = parseJsonStringArray(settings.allowedAdminRoles);
            const allowedRoles = [...staffRoles, ...adminRoles];

            if (allowedRoles.length === 0) return false;

            return this.memberHasRole(member, allowedRoles);
        } catch (error) {
            this.client.logger.error('[Snipe] Failed to check snipe permissions', error, { guildId });
            return false;
        }
    }

    /**
     * Checks if channel is in the allowed snipe channels list
     * 
     * @param guildId Guild ID
     * @param channelId Channel ID
     * @returns True if channel allows snipe
     */
    private async isChannelAllowed(guildId: string, channelId: string): Promise<boolean> {
        try {
            const settings = await this.database.guildChannelSettings.findUnique({
                where: { guildId }
            });

            if (!settings) return false;

            const allowedChannels = parseJsonStringArray(settings.allowedSnipeChannels);
            return allowedChannels.includes(channelId);
        } catch (error) {
            this.client.logger.error('[Snipe] Failed to check allowed channels', error, { guildId });
            return false;
        }
    }

    /**
     * Checks if member has any ignored snipe roles
     * - Members with these roles won't have their messages sniped
     * 
     * @param guildId Guild ID
     * @param member Member to check
     * @returns True if member has ignored role
     */
    private async hasIgnoredSnipeRoles(guildId: string, member: GuildMember): Promise<boolean> {
        try {
            const settings = await this.database.guildRoleSettings.findUnique({
                where: { guildId }
            });

            if (!settings) return false;

            const ignoredRoles = parseJsonStringArray(settings.ignoredSnipedRoles);
            return this.memberHasRole(member, ignoredRoles);
        } catch (error) {
            this.client.logger.error('[Snipe] Failed to check ignored roles', error, { guildId });
            return false;
        }
    }

    // ============================================================
    // Message Building
    // ============================================================

    /**
     * Builds a SnipedMessage object from Discord Message
     * - Extracts author, channel, and guild information
     * - Preserves attachments and embeds
     * 
     * @param message Discord message
     * @returns Sniped message object
     */
    private buildSnipedMessage(message: Message | PartialMessage): SnipedMessage {
        return {
            id: message.id,
            content: message.content || '',
            author: {
                id: message.author!.id,
                username: message.author!.username,
                discriminator: message.author!.discriminator,
                displayName: (message as Message).member?.displayName || message.author!.displayName || message.author!.username,
                avatarURL: message.author!.displayAvatarURL()
            },
            channel: {
                id: message.channel!.id,
                name: 'name' in message.channel! ? message.channel!.name || `Channel ${message.channel!.id}` : `Channel ${message.channel!.id}`
            },
            guild: {
                id: message.guild!.id,
                name: message.guild!.name
            },
            attachments: message.attachments?.map((att) => ({
                id: att.id,
                name: att.name,
                url: att.url,
                proxyURL: att.proxyURL,
                size: att.size
            })) || [],
            embeds: message.embeds?.map((embed) => ({
                title: embed.title || undefined,
                description: embed.description || undefined,
                url: embed.url || undefined
            })) || [],
            deletedAt: new Date(),
            createdAt: message.createdAt || new Date()
        };
    }

    // ============================================================
    // State Management
    // ============================================================

    /**
     * Gets or creates guild state container
     */
    private getOrCreateGuildState(guildId: string): GuildSnipeState {
        let state = this.guildStates.get(guildId);
        if (!state) {
            state = { messages: new Map() };
            this.guildStates.set(guildId, state);
        }
        return state;
    }

    /**
     * Checks if member has any of the specified roles
     * - Handles both API and GuildMember types
     */
    private memberHasRole(member: GuildMember | APIInteractionGuildMember, roleIds: string[]): boolean {
        // API interaction member (roles array)
        if ('roles' in member && Array.isArray(member.roles)) {
            return member.roles.some((roleId) => roleIds.includes(roleId));
        }

        // Guild member (roles cache)
        if ((member as GuildMember).roles?.cache) {
            return roleIds.some((roleId) => (member as GuildMember).roles.cache.has(roleId));
        }

        return false;
    }

    // ============================================================
    // Cleanup
    // ============================================================

    /**
     * Removes expired messages from all guild states
     * - Runs periodically (every 30 seconds)
     * - Removes empty guild states
     */
    private cleanupOldMessages(): void {
        const now = new Date();
        let cleanupCount = 0;

        for (const [guildId, guildState] of this.guildStates.entries()) {
            const toDelete: string[] = [];

            // Find expired messages
            for (const [channelId, message] of guildState.messages.entries()) {
                const timeSinceDeleted = now.getTime() - message.deletedAt.getTime();
                if (timeSinceDeleted > this.MESSAGE_RETENTION_MS) {
                    toDelete.push(channelId);
                    cleanupCount++;
                }
            }

            // Remove expired messages
            toDelete.forEach((channelId) => guildState.messages.delete(channelId));

            // Remove empty guild states
            if (guildState.messages.size === 0) {
                this.guildStates.delete(guildId);
            }
        }

        if (cleanupCount > 0) {
            this.client.logger.debug(`[Snipe] Cleaned up ${cleanupCount} expired messages`);
        }
    }
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
    interface Container {
        snipeManager: SnipeManager;
    }
}
