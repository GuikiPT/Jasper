// Guild slowmode settings service - Manages automatic slowmode configuration per guild
import type { GuildSlowmodeSettings, Prisma, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { createSubsystemLogger } from '../lib/subsystemLogger';

/**
 * Service for managing automatic slowmode settings
 * - Configures message thresholds and time windows
 * - Manages cooldown durations and reset times
 * - Controls maximum slowmode limits per channel
 * - Used by slowmode manager to enforce rate limiting
 */
export class GuildSlowmodeSettingsService {
    private readonly logger = createSubsystemLogger('GuildSlowmodeSettingsService');

    public constructor(
        private readonly database: PrismaClient,
        private readonly guildSettingsService: GuildSettingsService
    ) {}

    // ============================================================
    // Settings Management
    // ============================================================

    /**
     * Gets or creates slowmode settings for a guild
     * - Creates settings with default values if they don't exist
     * - Ensures parent guild settings exist first
     * 
     * @param guildId Guild ID
     * @returns Slowmode settings for the guild
     */
    public async getOrCreateSettings(guildId: string): Promise<GuildSlowmodeSettings> {
        const existing = await this.database.guildSlowmodeSettings.findUnique({ where: { guildId } });
        if (existing) return existing;

        // Ensure parent guild settings exist
        await this.guildSettingsService.ensureGuild(guildId);

        const createData: Prisma.GuildSlowmodeSettingsUncheckedCreateInput = { guildId };

        const created = await this.database.guildSlowmodeSettings.create({ data: createData });
        this.logger.info('Created slowmode settings for guild', { guildId });
        return created;
    }

    /**
     * Gets slowmode settings for a guild without creating them
     * 
     * @param guildId Guild ID
     * @returns Slowmode settings or null if not found
     */
    public async getSettings(guildId: string): Promise<GuildSlowmodeSettings | null> {
        return this.database.guildSlowmodeSettings.findUnique({ where: { guildId } });
    }

    /**
     * Updates slowmode settings for a guild
     * - Creates settings if they don't exist
     * - Only updates provided fields
     * 
     * Updatable fields:
     * - enabled: Whether automatic slowmode is active
     * - messageThreshold: Number of messages to trigger slowmode
     * - messageTimeWindow: Time window in seconds for message counting
     * - cooldownDuration: Slowmode cooldown in seconds
     * - resetTime: Time in seconds before slowmode resets
     * - maxSlowmode: Maximum slowmode duration allowed
     * 
     * @param guildId Guild ID
     * @param updates Partial settings to update
     * @returns Updated slowmode settings
     */
    public async updateSettings(
        guildId: string,
        updates: Partial<
            Pick<GuildSlowmodeSettings, 'enabled' | 'messageThreshold' | 'messageTimeWindow' | 'cooldownDuration' | 'resetTime' | 'maxSlowmode'>
        >
    ): Promise<GuildSlowmodeSettings> {
        // Ensure settings exist before updating
        await this.getOrCreateSettings(guildId);
        
        const updated = await this.database.guildSlowmodeSettings.update({
            where: { guildId },
            data: updates
        });

        this.logger.info('Updated slowmode settings', {
            guildId,
            updates
        });

        return updated;
    }
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
    interface Container {
        guildSlowmodeSettingsService: GuildSlowmodeSettingsService;
    }
}
