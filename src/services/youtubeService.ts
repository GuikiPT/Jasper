import { fetch, FetchResultTypes } from '@sapphire/fetch';
import { container } from '@sapphire/framework';
import { ChannelType } from 'discord.js';
import { createSubsystemLogger } from '../lib/subsystemLogger';
import { GuildYouTubeSettingsService } from './guildYouTubeSettingsService';

const logger = createSubsystemLogger('YouTubeService');

export interface YouTubeChannelMetadata {
	subscriberCount: string | null;
	channelName: string | null;
	channelAvatarUrl: string | null;
}

export class YouTubeService {
	private static instance: YouTubeService;
	private globalCheckInterval: NodeJS.Timeout | null = null;
	private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

	private constructor() {}

	public static getInstance(): YouTubeService {
		if (!YouTubeService.instance) {
			YouTubeService.instance = new YouTubeService();
		}
		return YouTubeService.instance;
	}

	/**
	 * Starts the YouTube service with global 5-minute checks
	 */
	public async start(): Promise<void> {
		logger.info('Starting YouTube subscriber tracking...');

		// Start the global check interval
		this.globalCheckInterval = setInterval(async () => {
			await this.checkAllGuildsForUpdates();
		}, this.CHECK_INTERVAL_MS);

		// Perform initial check
		await this.checkAllGuildsForUpdates();

		logger.info('YouTube service started with 5-minute global checks');
	}

	/**
	 * Stops the YouTube service
	 */
	public stop(): void {
		logger.info('Stopping YouTube subscriber tracking...');

		if (this.globalCheckInterval) {
			clearInterval(this.globalCheckInterval);
			this.globalCheckInterval = null;
		}

		logger.info('YouTube service stopped');
	}

	/**
	 * Checks all guilds for updates based on their individual intervals and cooldowns
	 */
	private async checkAllGuildsForUpdates(): Promise<void> {
		try {
			const allSettings = await GuildYouTubeSettingsService.getAllEnabledSettings();
			const currentTime = new Date();

			logger.debug(`Checking ${allSettings.length} enabled guilds for updates`);

			for (const settings of allSettings) {
				if (this.shouldUpdateGuild(settings, currentTime)) {
					await this.updateSubscriberCount(settings.guildId);
				}
			}
		} catch (error) {
			logger.error('Error during global check', error);
		}
	}

	/**
	 * Determines if a guild should be updated based on its interval and last update time
	 * @param settings The guild's YouTube settings
	 * @param currentTime The current time
	 * @returns True if the guild should be updated
	 */
	private shouldUpdateGuild(settings: any, currentTime: Date): boolean {
		// If never updated, update now
		if (!settings.lastTimeUpdated) {
			return true;
		}

		// Calculate time since last update
		const lastUpdateTime = new Date(settings.lastTimeUpdated);
		const timeSinceLastUpdate = currentTime.getTime() - lastUpdateTime.getTime();
		const requiredInterval = settings.updateIntervalMinutes * 60 * 1000; // Convert to milliseconds

		// Update if the required interval has passed
		return timeSinceLastUpdate >= requiredInterval;
	}

	/**
	 * Forces an immediate update for a specific guild
	 * @param guildId The guild ID to force update
	 */
	public async forceUpdate(guildId: string): Promise<{ success: boolean; message: string; currentCount?: number }> {
		try {
			const settings = await GuildYouTubeSettingsService.getSettings(guildId);

			if (!settings || !settings.enabled) {
				return { success: false, message: 'YouTube tracking is not enabled for this server' };
			}

			if (!settings.youtubeChannelUrl || !settings.discordChannelId) {
				return { success: false, message: 'YouTube tracking is not properly configured' };
			}

			const result = await this.updateSubscriberCount(guildId);
			return result;
		} catch (error) {
			logger.error(`Error during force update for guild ${guildId}`, error);
			return { success: false, message: 'An error occurred during the force update' };
		}
	}

	/**
	 * Gets the tracking status for a guild
	 * @param guildId The guild ID to check
	 */
	public async getTrackingStatus(guildId: string): Promise<{
		isEnabled: boolean;
		isTracking: boolean;
		settings?: any;
		nextUpdate?: Date;
		lastUpdated?: Date;
	}> {
		try {
			const settings = await GuildYouTubeSettingsService.getSettings(guildId);

			let nextUpdate: Date | undefined;
			let lastUpdated: Date | undefined;

			if (settings?.lastTimeUpdated) {
				lastUpdated = new Date(settings.lastTimeUpdated);
				const intervalMs = settings.updateIntervalMinutes * 60 * 1000;
				nextUpdate = new Date(lastUpdated.getTime() + intervalMs);
			}

			return {
				isEnabled: settings?.enabled ?? false,
				isTracking: this.globalCheckInterval !== null,
				settings,
				nextUpdate,
				lastUpdated
			};
		} catch (error) {
			logger.error(`Error getting tracking status for guild ${guildId}`, error);
			return { isEnabled: false, isTracking: false };
		}
	}

	/**
	 * Updates the subscriber count for a specific guild
	 * @param guildId The guild ID to update
	 */
	private async updateSubscriberCount(guildId: string): Promise<{ success: boolean; message: string; currentCount?: number }> {
		try {
			const settings = await GuildYouTubeSettingsService.getSettings(guildId);

			if (!settings || !settings.enabled || !settings.youtubeChannelUrl || !settings.discordChannelId) {
				return { success: false, message: 'Invalid settings configuration' };
			}

			// Get current subscriber count and metadata
			const metadata = await YouTubeService.fetchChannelMetadata(settings.youtubeChannelUrl);

			if (!metadata || metadata.subscriberCount === null) {
				return { success: false, message: 'Failed to fetch subscriber count from YouTube' };
			}

			const subscriberCount = metadata.subscriberCount;

			// Get the Discord channel
			const guild = container.client.guilds.cache.get(guildId);
			if (!guild) {
				return { success: false, message: 'Guild not found' };
			}

			const channel = guild.channels.cache.get(settings.discordChannelId);
			if (!channel) {
				return { success: false, message: 'Discord channel not found' };
			}

			const allowedChannelTypes = [ChannelType.GuildVoice, ChannelType.GuildText];
			if (!allowedChannelTypes.includes(channel.type)) {
				return { success: false, message: 'Target channel must be a text or voice channel' };
			}

			// Update channel name
			const newChannelName = YouTubeService.formatChannelName(subscriberCount);
			if ('setName' in channel && typeof channel.setName === 'function') {
				await channel.setName(newChannelName);
			} else if ('edit' in channel && typeof (channel as any).edit === 'function') {
				await (channel as any).edit({ name: newChannelName });
			} else {
				return { success: false, message: 'Unable to rename the configured channel' };
			}

			// Update database with new count, timestamp, and metadata
			await GuildYouTubeSettingsService.updateSubCountWithTimestamp(
				guildId,
				subscriberCount,
				new Date(),
				metadata.channelName,
				metadata.channelAvatarUrl
			);

			logger.info(`Updated ${guildId}: ${subscriberCount} subscribers -> ${newChannelName}`);

			return {
				success: true,
				message: `Updated channel name to ${newChannelName}`,
				currentCount: parseInt(subscriberCount)
			};
		} catch (error) {
			logger.error(`Error updating subscriber count for guild ${guildId}`, error);
			return { success: false, message: 'An error occurred while updating the subscriber count' };
		}
	}

	/**
	 * Gets the subscriber count from a YouTube channel URL
	 * @param channelUrl The YouTube channel URL (e.g., https://www.youtube.com/@MrBeast)
	 * @param lang Language preference for the response (default: en-US)
	 * @returns The subscriber count as a string or null if not found
	 */
	public static async getSubscriberCount(channelUrl: string, lang: string = 'en-US'): Promise<string | null> {
		const metadata = await YouTubeService.fetchChannelMetadata(channelUrl, lang);
		return metadata?.subscriberCount ?? null;
	}

	public static async fetchChannelMetadata(channelUrl: string, lang: string = 'en-US'): Promise<YouTubeChannelMetadata | null> {
		try {
			const headers = {
				'Accept-Language': lang,
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
			};

			const html = (await fetch(channelUrl, { headers }, FetchResultTypes.Text)) as string;

			let subscriberCount: string | null = null;
			const subscriberRegex = /"subscriberCountText".*?"simpleText":"([^"]+)"/;
			const match = html.match(subscriberRegex);
			if (match && match[1]) {
				subscriberCount = match[1];
			}

			if (!subscriberCount) {
				// Alternative regex patterns for different YouTube layouts
				const altPatterns = [
					/"subscriberCountText".*?"runs":\[{"text":"([^"]+)"/,
					/(\d+(?:\.\d+)?[KMB]?) subscribers/i,
					/"subscriberCount":{"simpleText":"([^"]+)"/
				];

				for (const pattern of altPatterns) {
					const altMatch = html.match(pattern);
					if (altMatch && altMatch[1]) {
						subscriberCount = altMatch[1];
						break;
					}
				}
			}

			const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
			const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);

			if (!subscriberCount) {
				logger.warn(`Could not find subscriber count for ${channelUrl}`);
			}

			return {
				subscriberCount: subscriberCount ?? null,
				channelName: titleMatch?.[1] ?? null,
				channelAvatarUrl: imageMatch?.[1] ?? null
			};
		} catch (error) {
			logger.error(`Error fetching metadata for ${channelUrl}`, error);
			return null;
		}
	}

	/**
	 * Formats a Discord channel name with subscriber count
	 * @param subCount The subscriber count string
	 * @returns Formatted channel name
	 */
	public static formatChannelName(subCount: string): string {
		return `📺 ｜ Sub Count: ${subCount}`;
	}

	/**
	 * Validates if a URL is a valid YouTube channel URL
	 * @param url The URL to validate
	 * @returns True if valid YouTube channel URL
	 */
	public static isValidYouTubeChannelUrl(url: string): boolean {
		try {
			const urlObj = new URL(url);
			const hostname = urlObj.hostname.toLowerCase();
			const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
			if (!allowedHosts.has(hostname)) {
				return false;
			}

			const path = urlObj.pathname;
			return path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/') || path.startsWith('/user/');
		} catch {
			return false;
		}
	}
}
