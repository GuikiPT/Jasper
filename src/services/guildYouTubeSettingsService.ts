import { container } from '@sapphire/framework';
import type { GuildYouTubeSettings } from '@prisma/client';

export class GuildYouTubeSettingsService {
	/**
	 * Gets the YouTube settings for a guild
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
	 * Creates or updates YouTube settings for a guild
	 * @param guildId The guild ID
	 * @param data The settings data to update
	 * @returns The updated settings
	 */
	public static async upsertSettings(
		guildId: string,
		data: Partial<Omit<GuildYouTubeSettings, 'guildId' | 'createdAt' | 'updatedAt'>>
	): Promise<GuildYouTubeSettings> {
		try {
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

	/**
	 * Enables YouTube subscriber tracking for a guild
	 * @param guildId The guild ID
	 * @param youtubeChannelUrl The YouTube channel URL to track
	 * @param discordChannelId The Discord channel ID to update
	 * @param updateIntervalMinutes Update interval in minutes (default: 30)
	 * @returns The updated settings
	 */
	public static async enableTracking(
		guildId: string,
		youtubeChannelUrl: string,
		discordChannelId: string,
		updateIntervalMinutes: number = 30,
		metadata?: Partial<Pick<GuildYouTubeSettings, 'channelName' | 'channelAvatarUrl'>>
	): Promise<GuildYouTubeSettings> {
		const payload: Partial<Omit<GuildYouTubeSettings, 'guildId' | 'createdAt' | 'updatedAt'>> = {
			enabled: true,
			youtubeChannelUrl,
			discordChannelId,
			updateIntervalMinutes
		};

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
	 * @param guildId The guild ID
	 * @returns The updated settings
	 */
	public static async disableTracking(guildId: string): Promise<GuildYouTubeSettings> {
		return this.upsertSettings(guildId, {
			enabled: false
		});
	}

	/**
	 * Updates the last known subscriber count
	 * @param guildId The guild ID
	 * @param subCount The subscriber count
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
	 * @param guildId The guild ID
	 * @param subCount The subscriber count
	 * @param timestamp The update timestamp
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

		if (channelName !== undefined) {
			payload.channelName = channelName;
		}

		if (channelAvatarUrl !== undefined) {
			payload.channelAvatarUrl = channelAvatarUrl;
		}

		return this.upsertSettings(guildId, payload);
	}

	/**
	 * Validates the update interval
	 * @param minutes The interval in minutes
	 * @returns True if valid (5-1440 minutes)
	 */
	public static isValidInterval(minutes: number): boolean {
		return minutes >= 5 && minutes <= 1440;
	}

	/**
	 * Gets all enabled YouTube settings across all guilds
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
}
