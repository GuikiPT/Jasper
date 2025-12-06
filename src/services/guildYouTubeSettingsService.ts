// Guild YouTube settings service - Manages YouTube subscriber tracking configuration
import { container } from '@sapphire/framework';
import type { GuildYouTubeSettings } from '@prisma/client';

// ============================================================
// Constants
// ============================================================

// Valid update interval range (5 minutes to 24 hours)
const MIN_UPDATE_INTERVAL_MINUTES = 5;
const MAX_UPDATE_INTERVAL_MINUTES = 1440;
const DEFAULT_UPDATE_INTERVAL_MINUTES = 30;

/**
 * Service for managing YouTube subscriber tracking settings
 * - Configure YouTube channel tracking per guild
 * - Manage update intervals and Discord notification channels
 * - Track subscriber counts with timestamps
 * - Enable/disable tracking
 * - Static class pattern for utility-style access
 */
export class GuildYouTubeSettingsService {
    // ============================================================
    // Settings Retrieval
    // ============================================================

    /**
     * Gets the YouTube settings for a guild
     * 
     * @param guildId The guild ID
     * @returns The YouTube settings or null if not found
     */
    public static async getSettings(guildId: string): Promise<GuildYouTubeSettings | null> {
        try {
            return await container.database.guildYouTubeSettings.findUnique({
                where: { guildId }
            });
        } catch (error) {
            container.logger.error(`[GuildYouTubeSettingsService] Error getting settings for guild ${guildId}:`, error);
            return null;
        }
    }

    /**
     * Gets all enabled YouTube settings across all guilds
     * - Filters for valid configurations only
     * - Used by YouTube service for monitoring
     * 
     * @returns Array of enabled YouTube settings
     */
    public static async getAllEnabledSettings(): Promise<GuildYouTubeSettings[]> {
        try {
            return await container.database.guildYouTubeSettings.findMany({
                where: {
                    enabled: true,
                    youtubeChannelUrl: { not: null },
                    discordChannelId: { not: null }
                }
            });
        } catch (error) {
            container.logger.error('[GuildYouTubeSettingsService] Error getting all enabled settings:', error);
            return [];
        }
    }

    // ============================================================
    // Settings Management
    // ============================================================

    /**
     * Creates or updates YouTube settings for a guild
     * - Ensures parent guild settings exist
     * - Updates only provided fields
     * 
     * @param guildId The guild ID
     * @param data The settings data to update
     * @returns The updated settings
     */
    public static async upsertSettings(
        guildId: string,
        data: Partial<Omit<GuildYouTubeSettings, 'guildId' | 'createdAt' | 'updatedAt'>>
    ): Promise<GuildYouTubeSettings> {
        try {
            // Ensure parent guild settings exist
            await container.guildSettingsService.ensureGuild(guildId);
            
            return await container.database.guildYouTubeSettings.upsert({
                where: { guildId },
                create: {
                    guildId,
                    ...data
                },
                update: data
            });
        } catch (error) {
            container.logger.error(`[GuildYouTubeSettingsService] Error upserting settings for guild ${guildId}:`, error);
            throw error;
        }
    }

    // ============================================================
    // Tracking Control
    // ============================================================

    /**
     * Enables YouTube subscriber tracking for a guild
     * - Configures YouTube channel and Discord notification channel
     * - Sets update interval (default: 30 minutes)
     * - Optionally stores channel metadata
     * 
     * @param guildId The guild ID
     * @param youtubeChannelUrl The YouTube channel URL to track
     * @param discordChannelId The Discord channel ID for updates
     * @param updateIntervalMinutes Update interval in minutes (default: 30)
     * @param metadata Optional channel name and avatar URL
     * @returns The updated settings
     */
    public static async enableTracking(
        guildId: string,
        youtubeChannelUrl: string,
        discordChannelId: string,
        updateIntervalMinutes: number = DEFAULT_UPDATE_INTERVAL_MINUTES,
        metadata?: Partial<Pick<GuildYouTubeSettings, 'channelName' | 'channelAvatarUrl'>>
    ): Promise<GuildYouTubeSettings> {
        const payload: Partial<Omit<GuildYouTubeSettings, 'guildId' | 'createdAt' | 'updatedAt'>> = {
            enabled: true,
            youtubeChannelUrl,
            discordChannelId,
            updateIntervalMinutes
        };

        // Add optional metadata if provided
        if (metadata) {
            if ('channelName' in metadata) {
                payload.channelName = metadata.channelName ?? null;
            }

            if ('channelAvatarUrl' in metadata) {
                payload.channelAvatarUrl = metadata.channelAvatarUrl ?? null;
            }
        }

        return this.upsertSettings(guildId, payload);
    }

    /**
     * Disables YouTube subscriber tracking for a guild
     * - Preserves existing configuration
     * - Stops monitoring without removing data
     * 
     * @param guildId The guild ID
     * @returns The updated settings
     */
    public static async disableTracking(guildId: string): Promise<GuildYouTubeSettings> {
        return this.upsertSettings(guildId, {
            enabled: false
        });
    }

    // ============================================================
    // Subscriber Count Updates
    // ============================================================

    /**
     * Updates the last known subscriber count
     * - Optionally updates channel metadata
     * 
     * @param guildId The guild ID
     * @param subCount The subscriber count
     * @param channelName Optional channel name update
     * @param channelAvatarUrl Optional channel avatar URL update
     * @returns The updated settings
     */
    public static async updateSubCount(
        guildId: string,
        subCount: string,
        channelName?: string | null,
        channelAvatarUrl?: string | null
    ): Promise<GuildYouTubeSettings> {
        const payload: Partial<Omit<GuildYouTubeSettings, 'guildId' | 'createdAt' | 'updatedAt'>> = {
            lastSubCount: subCount
        };

        // Add optional metadata updates
        if (channelName !== undefined) {
            payload.channelName = channelName;
        }

        if (channelAvatarUrl !== undefined) {
            payload.channelAvatarUrl = channelAvatarUrl;
        }

        return this.upsertSettings(guildId, payload);
    }

    /**
     * Updates the last known subscriber count with timestamp
     * - Records when the update occurred
     * - Optionally updates channel metadata
     * 
     * @param guildId The guild ID
     * @param subCount The subscriber count
     * @param timestamp The update timestamp
     * @param channelName Optional channel name update
     * @param channelAvatarUrl Optional channel avatar URL update
     * @returns The updated settings
     */
    public static async updateSubCountWithTimestamp(
        guildId: string,
        subCount: string,
        timestamp: Date,
        channelName?: string | null,
        channelAvatarUrl?: string | null
    ): Promise<GuildYouTubeSettings> {
        const payload: Partial<Omit<GuildYouTubeSettings, 'guildId' | 'createdAt' | 'updatedAt'>> = {
            lastSubCount: subCount,
            lastTimeUpdated: timestamp
        };

        // Add optional metadata updates
        if (channelName !== undefined) {
            payload.channelName = channelName;
        }

        if (channelAvatarUrl !== undefined) {
            payload.channelAvatarUrl = channelAvatarUrl;
        }

        return this.upsertSettings(guildId, payload);
    }

    // ============================================================
    // Validation
    // ============================================================

    /**
     * Validates the update interval
     * - Minimum: 5 minutes
     * - Maximum: 1440 minutes (24 hours)
     * 
     * @param minutes The interval in minutes
     * @returns True if valid
     */
    public static isValidInterval(minutes: number): boolean {
        return minutes >= MIN_UPDATE_INTERVAL_MINUTES && minutes <= MAX_UPDATE_INTERVAL_MINUTES;
    }
}
