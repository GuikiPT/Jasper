// Guild channel settings service - Manages channel-based guild settings (snipe, tags, slowmode)
import type { GuildChannelSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { BaseBucketSettingsService } from './baseBucketSettingsService';
import { createSubsystemLogger } from '../lib/subsystemLogger';

// ============================================================
// Constants and Types
// ============================================================

/**
 * Available channel bucket keys
 * - allowedSnipeChannels: Channels where snipe command works
 * - allowedTagChannels: Channels where tags can be managed
 * - automaticSlowmodeChannels: Channels with automatic slowmode
 */
export const CHANNEL_BUCKET_KEYS = [
	'allowedSnipeChannels',
	'allowedTagChannels',
	'automaticSlowmodeChannels'
] as const satisfies readonly (keyof GuildChannelSettings)[];

export type ChannelBucketKey = (typeof CHANNEL_BUCKET_KEYS)[number];

/**
 * Service for managing channel-based guild settings
 * - Manages collections of channel IDs for various features
 * - Provides add/remove/replace operations for channel buckets
 * - Inherits common bucket management from base service
 */
export class GuildChannelSettingsService extends BaseBucketSettingsService<GuildChannelSettings, ChannelBucketKey> {
	private readonly logger = createSubsystemLogger('GuildChannelSettingsService');

	public constructor(database: PrismaClient, guildSettingsService: GuildSettingsService) {
		super(database, guildSettingsService);
	}

	// ============================================================
	// Settings Management
	// ============================================================

	/**
	 * Gets or creates channel settings for a guild
	 * - Creates blank settings if they don't exist
	 * - Ensures parent guild settings exist first
	 *
	 * @param guildId Guild ID
	 * @returns Channel settings for the guild
	 */
	protected async getOrCreateSettings(guildId: string): Promise<GuildChannelSettings> {
		const existing = await this.database.guildChannelSettings.findUnique({ where: { guildId } });
		if (existing) return existing;

		// Ensure parent guild settings exist
		await this.guildSettingsService.ensureGuild(guildId);

		const created = await this.database.guildChannelSettings.create({
			data: this.createBlankSettings(guildId)
		});

		this.logger.info('Created channel settings for guild', { guildId });
		return created;
	}

	/**
	 * Gets channel settings for a guild without creating them
	 *
	 * @param guildId Guild ID
	 * @returns Channel settings or null if not found
	 */
	public async getSettings(guildId: string): Promise<GuildChannelSettings | null> {
		return this.database.guildChannelSettings.findUnique({ where: { guildId } });
	}

	// ============================================================
	// Bucket Operations
	// ============================================================

	/**
	 * Lists all channel IDs in a bucket
	 *
	 * @param guildId Guild ID
	 * @param bucket Bucket key name
	 * @returns Array of channel IDs
	 */
	public async listBucket(guildId: string, bucket: ChannelBucketKey): Promise<string[]> {
		const settings = await this.getOrCreateSettings(guildId);
		return this.parseValue(settings[bucket]);
	}

	/**
	 * Adds a channel to a bucket
	 * - Prevents duplicates
	 *
	 * @param guildId Guild ID
	 * @param bucket Bucket key name
	 * @param channelId Channel ID to add
	 * @returns Object with added status and updated channels array
	 */
	public async addChannel(guildId: string, bucket: ChannelBucketKey, channelId: string): Promise<{ added: boolean; channels: string[] }> {
		const result = await this.addItemToBucket(
			guildId,
			bucket,
			channelId,
			(settings) => settings[bucket],
			async (guildId, bucket, data) => {
				await this.database.guildChannelSettings.update({
					where: { guildId },
					data: { [bucket]: data }
				});
			}
		);

		this.logger.info(result.added ? 'Channel added to bucket' : 'Channel already present in bucket', {
			guildId,
			bucket,
			channelId,
			count: result.items.length
		});

		return { added: result.added, channels: result.items };
	}

	/**
	 * Removes a channel from a bucket
	 * - No-op if channel not in bucket
	 *
	 * @param guildId Guild ID
	 * @param bucket Bucket key name
	 * @param channelId Channel ID to remove
	 * @returns Object with removed status and updated channels array
	 */
	public async removeChannel(guildId: string, bucket: ChannelBucketKey, channelId: string): Promise<{ removed: boolean; channels: string[] }> {
		const result = await this.removeItemFromBucket(
			guildId,
			bucket,
			channelId,
			(settings) => settings[bucket],
			async (guildId, bucket, data) => {
				await this.database.guildChannelSettings.update({
					where: { guildId },
					data: { [bucket]: data }
				});
			}
		);

		this.logger.info(result.removed ? 'Channel removed from bucket' : 'Channel not present in bucket', {
			guildId,
			bucket,
			channelId,
			count: result.items.length
		});

		return { removed: result.removed, channels: result.items };
	}

	/**
	 * Replaces entire bucket contents with new channel list
	 * - Removes duplicates automatically
	 *
	 * @param guildId Guild ID
	 * @param bucket Bucket key name
	 * @param channels Channel IDs to set
	 */
	public async replaceBucket(guildId: string, bucket: ChannelBucketKey, channels: Iterable<string>) {
		const uniqueChannels = Array.from(new Set(Array.from(channels)));

		await this.replaceBucketContents(guildId, bucket, uniqueChannels, async (guildId, bucket, data) => {
			await this.database.guildChannelSettings.update({
				where: { guildId },
				data: { [bucket]: data }
			});
		});

		this.logger.info('Replaced channel bucket contents', {
			guildId,
			bucket,
			count: uniqueChannels.length
		});
	}

	/**
	 * Gets all channel buckets for a guild
	 * - Returns all buckets in a single object
	 *
	 * @param guildId Guild ID
	 * @returns Object mapping bucket keys to channel ID arrays
	 */
	public async getAllBuckets(guildId: string): Promise<Record<ChannelBucketKey, string[]>> {
		const settings = await this.getOrCreateSettings(guildId);
		return CHANNEL_BUCKET_KEYS.reduce(
			(acc, bucket) => {
				acc[bucket] = this.parseValue(settings[bucket]);
				return acc;
			},
			{} as Record<ChannelBucketKey, string[]>
		);
	}

	// ============================================================
	// Helper Methods
	// ============================================================

	/**
	 * Creates blank channel settings with empty buckets
	 *
	 * @param guildId Guild ID
	 * @returns Settings object with empty JSON arrays
	 */
	private createBlankSettings(guildId: string) {
		return {
			guildId,
			allowedSnipeChannels: JSON.stringify([]),
			allowedTagChannels: JSON.stringify([]),
			automaticSlowmodeChannels: JSON.stringify([])
		};
	}
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
	interface Container {
		guildChannelSettingsService: GuildChannelSettingsService;
	}
}
