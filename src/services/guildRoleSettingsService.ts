// Guild role settings service - Manages role-based guild settings for access control
import type { GuildRoleSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { BaseBucketSettingsService } from './baseBucketSettingsService';
import { createSubsystemLogger } from '../lib/subsystemLogger';

// ============================================================
// Constants and Types
// ============================================================

/**
 * Available role bucket keys
 * - allowedAdminRoles: Roles that can use admin commands
 * - allowedStaffRoles: Roles that can use staff commands
 * - allowedTagAdminRoles: Roles that can manage tags
 * - allowedTagRoles: Roles that can use tags
 * - ignoredSnipedRoles: Roles whose messages won't be sniped
 * - supportRoles: Roles that can use support commands
 */
export const ROLE_BUCKET_KEYS = [
    'allowedAdminRoles',
    'allowedStaffRoles',
    'allowedTagAdminRoles',
    'allowedTagRoles',
    'ignoredSnipedRoles',
    'supportRoles'
] as const satisfies readonly (keyof GuildRoleSettings)[];

export type RoleBucketKey = (typeof ROLE_BUCKET_KEYS)[number];

/**
 * Service for managing role-based guild settings
 * - Manages collections of role IDs for access control
 * - Provides add/remove/replace operations for role buckets
 * - Used by preconditions to check command access
 * - Inherits common bucket management from base service
 */
export class GuildRoleSettingsService extends BaseBucketSettingsService<GuildRoleSettings, RoleBucketKey> {
    private readonly logger = createSubsystemLogger('GuildRoleSettingsService');

    public constructor(database: PrismaClient, guildSettingsService: GuildSettingsService) {
        super(database, guildSettingsService);
    }

    // ============================================================
    // Settings Management
    // ============================================================

    /**
     * Gets or creates role settings for a guild
     * - Creates blank settings if they don't exist
     * - Ensures parent guild settings exist first
     * 
     * @param guildId Guild ID
     * @returns Role settings for the guild
     */
    protected async getOrCreateSettings(guildId: string): Promise<GuildRoleSettings> {
        const existing = await this.database.guildRoleSettings.findUnique({ where: { guildId } });
        if (existing) return existing;

        // Ensure parent guild settings exist
        await this.guildSettingsService.ensureGuild(guildId);

        const created = await this.database.guildRoleSettings.create({
            data: this.createBlankSettings(guildId)
        });

        this.logger.info('Created role settings for guild', { guildId });
        return created;
    }

    /**
     * Gets role settings for a guild without creating them
     * 
     * @param guildId Guild ID
     * @returns Role settings or null if not found
     */
    public async getSettings(guildId: string): Promise<GuildRoleSettings | null> {
        return this.database.guildRoleSettings.findUnique({ where: { guildId } });
    }

    // ============================================================
    // Bucket Operations
    // ============================================================

    /**
     * Lists all role IDs in a bucket
     * 
     * @param guildId Guild ID
     * @param bucket Bucket key name
     * @returns Array of role IDs
     */
    public async listBucket(guildId: string, bucket: RoleBucketKey): Promise<string[]> {
        const settings = await this.getOrCreateSettings(guildId);
        return this.parseValue(settings[bucket]);
    }

    /**
     * Adds a role to a bucket
     * - Prevents duplicates
     * 
     * @param guildId Guild ID
     * @param bucket Bucket key name
     * @param roleId Role ID to add
     * @returns Object with added status and updated roles array
     */
    public async addRole(guildId: string, bucket: RoleBucketKey, roleId: string): Promise<{ added: boolean; roles: string[] }> {
        const result = await this.addItemToBucket(
            guildId,
            bucket,
            roleId,
            (settings) => settings[bucket],
            async (guildId, bucket, data) => {
                await this.database.guildRoleSettings.update({
                    where: { guildId },
                    data: { [bucket]: data }
                });
            }
        );

        this.logger.info(result.added ? 'Role added to bucket' : 'Role already present in bucket', {
            guildId,
            bucket,
            roleId,
            count: result.items.length
        });

        return { added: result.added, roles: result.items };
    }

    /**
     * Removes a role from a bucket
     * - No-op if role not in bucket
     * 
     * @param guildId Guild ID
     * @param bucket Bucket key name
     * @param roleId Role ID to remove
     * @returns Object with removed status and updated roles array
     */
    public async removeRole(guildId: string, bucket: RoleBucketKey, roleId: string): Promise<{ removed: boolean; roles: string[] }> {
        const result = await this.removeItemFromBucket(
            guildId,
            bucket,
            roleId,
            (settings) => settings[bucket],
            async (guildId, bucket, data) => {
                await this.database.guildRoleSettings.update({
                    where: { guildId },
                    data: { [bucket]: data }
                });
            }
        );

        this.logger.info(result.removed ? 'Role removed from bucket' : 'Role not present in bucket', {
            guildId,
            bucket,
            roleId,
            count: result.items.length
        });

        return { removed: result.removed, roles: result.items };
    }

    /**
     * Replaces entire bucket contents with new role list
     * - Removes duplicates automatically
     * 
     * @param guildId Guild ID
     * @param bucket Bucket key name
     * @param roles Role IDs to set
     */
    public async replaceBucket(guildId: string, bucket: RoleBucketKey, roles: Iterable<string>) {
        const uniqueRoles = Array.from(new Set(Array.from(roles)));

        await this.replaceBucketContents(guildId, bucket, uniqueRoles, async (guildId, bucket, data) => {
            await this.database.guildRoleSettings.update({
                where: { guildId },
                data: { [bucket]: data }
            });
        });

        this.logger.info('Replaced role bucket contents', {
            guildId,
            bucket,
            count: uniqueRoles.length
        });
    }

    /**
     * Gets all role buckets for a guild
     * - Returns all buckets in a single object
     * - Reduces database round-trips for bulk access
     * 
     * @param guildId Guild ID
     * @returns Object mapping bucket keys to role ID arrays
     */
    public async getAllBuckets(guildId: string): Promise<Record<RoleBucketKey, string[]>> {
        const settings = await this.getOrCreateSettings(guildId);
        return ROLE_BUCKET_KEYS.reduce(
            (acc, bucket) => {
                acc[bucket] = this.parseValue(settings[bucket]);
                return acc;
            },
            {} as Record<RoleBucketKey, string[]>
        );
    }

    // ============================================================
    // Helper Methods
    // ============================================================

    /**
     * Creates blank role settings with empty buckets
     * 
     * @param guildId Guild ID
     * @returns Settings object with empty JSON arrays
     */
    private createBlankSettings(guildId: string) {
        return {
            guildId,
            allowedAdminRoles: JSON.stringify([]),
            allowedStaffRoles: JSON.stringify([]),
            allowedTagAdminRoles: JSON.stringify([]),
            allowedTagRoles: JSON.stringify([]),
            ignoredSnipedRoles: JSON.stringify([]),
            supportRoles: JSON.stringify([])
        };
    }
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
    interface Container {
        guildRoleSettingsService: GuildRoleSettingsService;
    }
}
