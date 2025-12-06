// Guild support settings service - Manages support forum and thread configuration
import type { GuildSupportSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';

// ============================================================
// Constants and Types
// ============================================================

/**
 * Available support setting keys
 * - supportForumChannelId: Discord forum channel ID for support threads
 * - resolvedTagId: Tag ID to apply when threads are resolved
 * - inactivityReminderMinutes: Minutes before sending inactivity reminder
 * - autoCloseMinutes: Minutes of inactivity before auto-closing thread
 */
export const SUPPORT_SETTING_KEYS = [
    'supportForumChannelId',
    'resolvedTagId',
    'inactivityReminderMinutes',
    'autoCloseMinutes'
] as const satisfies readonly (keyof GuildSupportSettings)[];

export type SupportSettingKey = (typeof SUPPORT_SETTING_KEYS)[number];

/**
 * Service for managing support forum settings
 * - Configures support forum channel and resolved tag
 * - Manages inactivity monitoring thresholds
 * - Controls auto-close behavior for inactive threads
 * - Used by support thread monitor and thread creation handler
 */
export class GuildSupportSettingsService {
    public constructor(
        private readonly database: PrismaClient,
        private readonly guildSettingsService: GuildSettingsService
    ) {}

    // ============================================================
    // Settings Management
    // ============================================================

    /**
     * Gets support settings for a guild without creating them
     * 
     * @param guildId Guild ID
     * @returns Support settings or null if not found
     */
    public async getSettings(guildId: string): Promise<GuildSupportSettings | null> {
        return this.database.guildSupportSettings.findUnique({ where: { guildId } });
    }

    /**
     * Gets or creates support settings for a guild
     * - Creates settings with default values if they don't exist
     * - Ensures parent guild settings exist first
     * 
     * @param guildId Guild ID
     * @returns Support settings for the guild
     */
    public async getOrCreateSettings(guildId: string): Promise<GuildSupportSettings> {
        const existing = await this.getSettings(guildId);
        if (existing) return existing;

        // Ensure parent guild settings exist
        await this.guildSettingsService.ensureGuild(guildId);
        
        return this.database.guildSupportSettings.create({ data: { guildId } });
    }

    /**
     * Sets a single support setting
     * - Creates settings if they don't exist
     * - Updates existing settings if found
     * 
     * @param guildId Guild ID
     * @param key Setting key to update
     * @param value New value (string for IDs, number for durations, null to clear)
     * @returns Updated support settings
     */
    public async setSetting(guildId: string, key: SupportSettingKey, value: string | number | null): Promise<GuildSupportSettings> {
        // Ensure parent guild settings exist
        await this.guildSettingsService.ensureGuild(guildId);
        
        return this.database.guildSupportSettings.upsert({
            where: { guildId },
            create: {
                guildId,
                [key]: value
            },
            update: {
                [key]: value
            }
        });
    }
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
    interface Container {
        guildSupportSettingsService: GuildSupportSettingsService;
    }
}
