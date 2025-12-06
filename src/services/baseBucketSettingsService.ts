// Base bucket settings service - Abstract service for managing bucket-based guild settings
import type { PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { Logger } from '../lib/logger';

/**
 * Abstract base class for services managing bucket-based guild settings
 * 
 * Provides common functionality for managing collections (buckets) of items:
 * - Parsing bucket values from database (JSON, arrays, buffers)
 * - Adding items with duplicate prevention
 * - Removing items with existence checks
 * - Replacing entire bucket contents
 * 
 * Used for managing role buckets (admin roles, staff roles, etc.) and 
 * channel buckets (allowed channels, log channels, etc.)
 *
 * @template TSettings - The Prisma model type for the settings entity (e.g., GuildRoleSettings)
 * @template TBucketKey - Union type of valid bucket key names (e.g., 'allowedAdminRoles' | 'allowedStaffRoles')
 */
export abstract class BaseBucketSettingsService<TSettings, TBucketKey extends string> {
    protected constructor(
        protected readonly database: PrismaClient,
        protected readonly guildSettingsService: GuildSettingsService
    ) {}

    // ============================================================
    // Parsing Utilities
    // ============================================================

    /**
     * Parses a bucket value from the database into a string array
     * - Handles JSON strings with parse error recovery
     * - Handles array values with type filtering
     * - Handles Buffer values (converts to UTF-8)
     * - Returns empty array for null/undefined
     * 
     * @param value Raw database value
     * @returns Parsed string array
     */
    protected parseValue(value: unknown): string[] {
        if (value === null || value === undefined) return [];

        // Handle array values (filter out non-strings)
        if (Array.isArray(value)) {
            return value.filter((entry): entry is string => typeof entry === 'string');
        }

        // Handle JSON string values
        if (typeof value === 'string') {
            if (value.length === 0) return [];
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
            } catch (error) {
                Logger.debug('Failed to parse bucket JSON', { error });
                return [];
            }
        }

        // Handle Buffer values (convert to UTF-8 string and re-parse)
        if (Buffer.isBuffer(value)) {
            return this.parseValue(value.toString('utf8'));
        }

        return [];
    }

    // ============================================================
    // Bucket Item Management
    // ============================================================

    /**
     * Adds an item to a bucket if it doesn't already exist
     * - Checks for duplicates before adding
     * - Persists updated bucket to database
     * 
     * @param guildId Guild ID
     * @param bucket Bucket key name
     * @param itemId Item ID to add
     * @param getCurrentBucket Function to extract current bucket from settings
     * @param updateBucket Function to persist updated bucket
     * @returns Object with added status and updated items array
     */
    protected async addItemToBucket(
        guildId: string,
        bucket: TBucketKey,
        itemId: string,
        getCurrentBucket: (settings: TSettings) => unknown,
        updateBucket: (guildId: string, bucket: TBucketKey, data: string) => Promise<void>
    ): Promise<{ added: boolean; items: string[] }> {
        const settings = await this.getOrCreateSettings(guildId);
        const items = this.parseValue(getCurrentBucket(settings));

        // Check for duplicate
        if (items.includes(itemId)) {
            return { added: false, items };
        }

        // Add item and persist
        items.push(itemId);
        await updateBucket(guildId, bucket, JSON.stringify(items));

        return { added: true, items };
    }

    /**
     * Removes an item from a bucket if it exists
     * - Checks for existence before removing
     * - Persists updated bucket to database
     * 
     * @param guildId Guild ID
     * @param bucket Bucket key name
     * @param itemId Item ID to remove
     * @param getCurrentBucket Function to extract current bucket from settings
     * @param updateBucket Function to persist updated bucket
     * @returns Object with removed status and updated items array
     */
    protected async removeItemFromBucket(
        guildId: string,
        bucket: TBucketKey,
        itemId: string,
        getCurrentBucket: (settings: TSettings) => unknown,
        updateBucket: (guildId: string, bucket: TBucketKey, data: string) => Promise<void>
    ): Promise<{ removed: boolean; items: string[] }> {
        const settings = await this.getOrCreateSettings(guildId);
        const items = this.parseValue(getCurrentBucket(settings));

        // Find item index
        const index = items.indexOf(itemId);
        if (index === -1) {
            return { removed: false, items };
        }

        // Remove item and persist
        items.splice(index, 1);
        await updateBucket(guildId, bucket, JSON.stringify(items));

        return { removed: true, items };
    }

    /**
     * Replaces the entire bucket contents with provided items
     * - Ensures uniqueness by using Set
     * - Creates settings if they don't exist
     * 
     * @param guildId Guild ID
     * @param bucket Bucket key name
     * @param items Items to set (duplicates will be removed)
     * @param updateBucket Function to persist updated bucket
     */
    protected async replaceBucketContents(
        guildId: string,
        bucket: TBucketKey,
        items: Iterable<string>,
        updateBucket: (guildId: string, bucket: TBucketKey, data: string) => Promise<void>
    ): Promise<void> {
        // Remove duplicates
        const uniqueItems = Array.from(new Set(Array.from(items)));
        
        // Ensure settings exist
        await this.getOrCreateSettings(guildId);
        
        // Persist bucket
        await updateBucket(guildId, bucket, JSON.stringify(uniqueItems));
    }

    // ============================================================
    // Abstract Methods
    // ============================================================

    /**
     * Gets or creates settings for a guild
     * - Must be implemented by derived classes
     * - Should ensure settings exist in database
     * 
     * @param guildId Guild ID
     * @returns Settings object for the guild
     */
    protected abstract getOrCreateSettings(guildId: string): Promise<TSettings>;
}
