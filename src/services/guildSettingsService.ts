// Guild settings service - Manages core guild settings including custom prefixes
import type { GuildSettings, PrismaClient } from '@prisma/client';

/**
 * Service for managing core guild settings
 * - Ensures guild records exist in database
 * - Manages custom command prefixes per guild
 * - Foundation service for other guild setting services
 */
export class GuildSettingsService {
    public constructor(private readonly database: PrismaClient) {}

    // ============================================================
    // Guild Management
    // ============================================================

    /**
     * Ensures a guild record exists in the database
     * - Creates record if it doesn't exist
     * - Returns existing record if found
     * - Used by other services to ensure parent record exists
     * 
     * @param guildId Guild ID
     * @returns Guild settings record
     */
    public async ensureGuild(guildId: string): Promise<GuildSettings> {
        return this.database.guildSettings.upsert({
            where: { id: guildId },
            create: { id: guildId },
            update: {}
        });
    }

    /**
     * Retrieves guild settings without creating them
     * 
     * @param guildId Guild ID
     * @returns Guild settings or null if not found
     */
    public async getSettings(guildId: string): Promise<GuildSettings | null> {
        return this.database.guildSettings.findUnique({ where: { id: guildId } });
    }

    // ============================================================
    // Prefix Management
    // ============================================================

    /**
     * Gets the custom prefix for a guild
     * - Returns null if no custom prefix is set
     * - Falls back to default Sapphire prefix when null
     * 
     * @param guildId Guild ID
     * @returns Custom prefix or null
     */
    public async getPrefix(guildId: string): Promise<string | null> {
        const settings = await this.getSettings(guildId);
        return settings?.prefix ?? null;
    }

    /**
     * Sets a custom prefix for a guild
     * - Creates guild record if it doesn't exist
     * - Updates existing record if found
     * 
     * @param guildId Guild ID
     * @param prefix Custom prefix to set
     */
    public async setPrefix(guildId: string, prefix: string): Promise<void> {
        await this.database.guildSettings.upsert({
            where: { id: guildId },
            create: { id: guildId, prefix },
            update: { prefix }
        });
    }

    /**
     * Clears the custom prefix for a guild
     * - Sets prefix to null
     * - Bot will use default Sapphire prefix
     * 
     * @param guildId Guild ID
     */
    public async clearPrefix(guildId: string): Promise<void> {
        await this.database.guildSettings.upsert({
            where: { id: guildId },
            create: { id: guildId, prefix: null },
            update: { prefix: null }
        });
    }
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
    interface Container {
        guildSettingsService: GuildSettingsService;
    }
}
