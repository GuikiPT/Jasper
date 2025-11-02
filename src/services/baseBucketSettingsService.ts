// baseBucketSettingsService module within services
import type { PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { Logger } from '../lib/logger';

/**
 * Abstract base class for services managing bucket-based guild settings (roles, channels, etc.).
 * Provides common functionality for parsing, adding, removing, and replacing bucket contents.
 */
export abstract class BaseBucketSettingsService<TSettings, TBucketKey extends string> {
	protected constructor(
		protected readonly database: PrismaClient,
		protected readonly guildSettingsService: GuildSettingsService
	) {}

	/**
	 * Parses a bucket value from the database into a string array.
	 * Handles JSON strings, arrays, buffers, and null/undefined values.
	 */
	protected parseValue(value: unknown): string[] {
		if (value === null || value === undefined) return [];

		if (Array.isArray(value)) {
			return value.filter((entry): entry is string => typeof entry === 'string');
		}

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

		if (Buffer.isBuffer(value)) {
			return this.parseValue(value.toString('utf8'));
		}

		return [];
	}

	/**
	 * Adds an item to a bucket if it doesn't already exist.
	 * Returns whether the item was added and the updated list.
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

		if (items.includes(itemId)) {
			return { added: false, items };
		}

		items.push(itemId);
		await updateBucket(guildId, bucket, JSON.stringify(items));

		return { added: true, items };
	}

	/**
	 * Removes an item from a bucket if it exists.
	 * Returns whether the item was removed and the updated list.
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

		const index = items.indexOf(itemId);
		if (index === -1) {
			return { removed: false, items };
		}

		items.splice(index, 1);
		await updateBucket(guildId, bucket, JSON.stringify(items));

		return { removed: true, items };
	}

	/**
	 * Replaces the entire bucket contents with the provided items.
	 * Ensures uniqueness of items.
	 */
	protected async replaceBucketContents(
		guildId: string,
		bucket: TBucketKey,
		items: Iterable<string>,
		updateBucket: (guildId: string, bucket: TBucketKey, data: string) => Promise<void>
	): Promise<void> {
		const uniqueItems = Array.from(new Set(Array.from(items)));
		await this.getOrCreateSettings(guildId);
		await updateBucket(guildId, bucket, JSON.stringify(uniqueItems));
	}

	/**
	 * Abstract method to get or create settings for a guild.
	 * Must be implemented by derived classes.
	 */
	protected abstract getOrCreateSettings(guildId: string): Promise<TSettings>;
}
