import type { PrismaClient } from '@prisma/client';
import type { SapphireClient } from '@sapphire/framework';
import type { Channel, Message } from 'discord.js';

interface SlowmodeConfig {
	enabled: boolean;
	messageThreshold: number;
	messageTimeWindow: number;
	cooldownDuration: number;
	resetTime: number;
	maxSlowmode: number;
	channels: string[];
}

interface ChannelActivityState {
	messageTimestamps: number[];
	lastSlowmodeUpdate: number;
	activeSlowmode: number;
	resetTimer: NodeJS.Timeout | null;
}

type SlowmodeCapableChannel = Channel & {
	rateLimitPerUser: number | null | undefined;
	setRateLimitPerUser(seconds: number, reason?: string): Promise<unknown>;
};

const MIN_SLOWMODE_SECONDS = 1;

interface GuildState {
	configKey: string | null;
	channels: Map<string, ChannelActivityState>;
}

export class SlowmodeManager {
	private readonly guildStates = new Map<string, GuildState>();

	public constructor(private readonly client: SapphireClient, private readonly database: PrismaClient) { }

	public async handleMessage(message: Message) {
		if (!message.guildId) return;
		const channel = message.channel;
		if (!channel || message.author.bot) return;

		const config = await this.loadConfig(message.guildId);
		const guildState = this.getGuildState(message.guildId);
		const configKey = this.createConfigKey(config);

		if (guildState.configKey !== configKey) {
			await this.applyConfigChange(message.guildId, guildState, config);
			guildState.configKey = configKey;
			this.client.logger.debug('[Slowmode] Configuration refreshed for message', {
				guildId: message.guildId,
				channelId: channel.id,
				configKey
			});
		}

		if (!config || !config.enabled) {
			this.client.logger.debug('[Slowmode] Ignoring message, automatic slowmode disabled', {
				guildId: message.guildId,
				channelId: channel.id
			});
			return;
		}
		if (!config.channels.includes(channel.id)) {
			await this.disableChannelIfTracked(message.guildId, channel.id, {
				reason: 'Automatic slowmode disabled for channel due to configuration update.'
			});
			this.client.logger.debug('[Slowmode] Message in non-managed channel', {
				guildId: message.guildId,
				channelId: channel.id
			});
			return;
		}
		if (!this.isSlowmodeCapable(channel)) return;

		const state = this.getChannelState(message.guildId, channel.id);
		const now = Date.now();
		const windowMs = Math.max(config.messageTimeWindow, 1) * 1000;
		const cutoff = now - windowMs;
		const timestamps = state.messageTimestamps;

		while (timestamps.length > 0) {
			const oldest = timestamps[0];
			if (oldest === undefined || oldest > cutoff) break;
			timestamps.shift();
		}

		timestamps.push(now);
		const messageCount = timestamps.length;
		const windowStart = timestamps[0];
		const windowElapsedMs = windowStart === undefined ? 0 : now - windowStart;
		const threshold = Math.max(config.messageThreshold, 1);
		this.client.logger.debug('[Slowmode] Message recorded', {
			guildId: message.guildId,
			channelId: channel.id,
			messageCount,
			threshold: config.messageThreshold,
			windowElapsedMs
		});

		if (messageCount < threshold) {
			this.client.logger.debug('[Slowmode] Below threshold, no action needed', {
				guildId: message.guildId,
				channelId: channel.id,
				messageCount,
				threshold
			});
			return;
		}

		this.client.logger.info('[Slowmode] Threshold reached, processing slowmode', {
			guildId: message.guildId,
			channelId: channel.id,
			messageCount,
			threshold
		});

		const slowmodeSeconds = this.calculateSlowmodeSeconds(messageCount, config);
		const typedChannel = channel as SlowmodeCapableChannel;
		const currentSlowmode = typedChannel.rateLimitPerUser ?? 0;
		const activeSlowmode = state.activeSlowmode;
		const cooldownMs = Math.max(config.cooldownDuration, 1) * 1000;

		this.client.logger.debug('[Slowmode] Threshold reached - calculating slowmode', {
			guildId: message.guildId,
			channelId: channel.id,
			messageCount,
			calculatedSlowmode: slowmodeSeconds,
			currentSlowmode,
			activeSlowmode,
			cooldownMs
		});

		if (
			state.lastSlowmodeUpdate > 0 &&
			now - state.lastSlowmodeUpdate < cooldownMs &&
			slowmodeSeconds <= Math.max(activeSlowmode, currentSlowmode)
		) {
			this.client.logger.debug('[Slowmode] Cooldown active, skipping update', {
				guildId: message.guildId,
				channelId: channel.id,
				messageCount,
				elapsedSinceUpdateMs: now - state.lastSlowmodeUpdate,
				cooldownMs,
				activeSlowmode
			});
			return;
		}

		if (currentSlowmode >= slowmodeSeconds) {
			state.activeSlowmode = Math.max(currentSlowmode, MIN_SLOWMODE_SECONDS);
			this.scheduleReset(message.guildId, channel.id, config.resetTime);
			this.client.logger.debug('[Slowmode] Existing rate limit sufficient', {
				guildId: message.guildId,
				channelId: channel.id,
				currentSlowmode,
				requiredSlowmode: slowmodeSeconds
			});
			return;
		}

		try {
			await typedChannel.setRateLimitPerUser(
				slowmodeSeconds,
				`Automatic slowmode triggered after ${messageCount} messages in ${config.messageTimeWindow}s.`
			);
			state.activeSlowmode = slowmodeSeconds;
			state.lastSlowmodeUpdate = now;
			this.scheduleReset(message.guildId, channel.id, config.resetTime);
			this.client.logger.info('[Slowmode] Upgraded automatic slowmode', {
				guildId: message.guildId,
				channelId: channel.id,
				previousSlowmode: currentSlowmode,
				newSlowmode: slowmodeSeconds,
				messageCount,
				window: config.messageTimeWindow
			});
		} catch (error) {
			this.client.logger.warn('Failed to set automatic slowmode', error, {
				guildId: message.guildId,
				channelId: channel.id
			});
		}
	}

	public async handleSettingsUpdated(guildId: string) {
		const guildState = this.getGuildState(guildId);
		try {
			const config = await this.loadConfig(guildId);
			await this.applyConfigChange(guildId, guildState, config);
			guildState.configKey = this.createConfigKey(config);
			this.client.logger.info('[Slowmode] Settings refreshed after manual update', { guildId });
		} catch (error) {
			this.client.logger.warn('Failed to refresh slowmode settings after manual update', error, { guildId });
			guildState.configKey = null;
		}
	}

	private scheduleReset(guildId: string, channelId: string, resetTime: number) {
		const state = this.getChannelState(guildId, channelId);
		if (state.resetTimer) {
			clearTimeout(state.resetTimer);
		}

		const delay = Math.max(resetTime, 1) * 1000;
		state.resetTimer = setTimeout(() => void this.resetSlowmode(guildId, channelId), delay);
	}

	private async resetSlowmode(
		guildId: string,
		channelId: string,
		options: { providedState?: ChannelActivityState; reason?: string; prune?: boolean } = {}
	) {
		const guildState = this.getGuildState(guildId);
		const state = options.providedState ?? guildState.channels.get(channelId);
		if (!state) return;

		if (state.resetTimer) {
			clearTimeout(state.resetTimer);
			state.resetTimer = null;
		}

		if (!state.activeSlowmode || state.activeSlowmode <= MIN_SLOWMODE_SECONDS) {
			state.messageTimestamps.length = 0;
			state.lastSlowmodeUpdate = 0;
			if (options.prune) {
				guildState.channels.delete(channelId);
			}
			if (options.reason) {
				this.client.logger.debug('[Slowmode] Channel state cleared without significant rate limit', {
					guildId,
					channelId,
					activeSlowmode: state.activeSlowmode,
					reason: options.reason
				});
			}
			return;
		}

		const channel = await this.fetchSlowmodeChannel(channelId);
		if (!channel) {
			state.activeSlowmode = MIN_SLOWMODE_SECONDS;
			state.lastSlowmodeUpdate = 0;
			state.messageTimestamps.length = 0;
			if (options.prune) {
				guildState.channels.delete(channelId);
			}
			return;
		}

		const currentSlowmode = channel.rateLimitPerUser ?? 0;
		if (currentSlowmode !== state.activeSlowmode) {
			state.activeSlowmode = Math.max(currentSlowmode, MIN_SLOWMODE_SECONDS);
			if (options.prune && currentSlowmode <= MIN_SLOWMODE_SECONDS) {
				guildState.channels.delete(channelId);
			}
			return;
		}

		try {
			await channel.setRateLimitPerUser(MIN_SLOWMODE_SECONDS, options.reason ?? 'Automatic slowmode reset to minimum after inactivity.');
			state.activeSlowmode = MIN_SLOWMODE_SECONDS;
			state.lastSlowmodeUpdate = 0;
			state.messageTimestamps.length = 0;
			if (options.prune) {
				guildState.channels.delete(channelId);
			}
			this.client.logger.info('[Slowmode] Slowmode reset to minimum', {
				guildId,
				channelId,
				slowmode: MIN_SLOWMODE_SECONDS,
				reason: options.reason ?? 'inactivity'
			});
		} catch (error) {
			this.client.logger.warn('Failed to reset automatic slowmode', error, {
				guildId,
				channelId
			});
		}
	}

	private calculateSlowmodeSeconds(messageCount: number, config: SlowmodeConfig) {
		const threshold = Math.max(config.messageThreshold, 1);
		const ratio = messageCount / threshold;
		const overThresholdRatio = Math.max(0, ratio - 1);
		const scaled = MIN_SLOWMODE_SECONDS + Math.ceil(overThresholdRatio * 2);
		const slowmode = Math.max(MIN_SLOWMODE_SECONDS, scaled);
		return Math.min(config.maxSlowmode, slowmode);
	}

	private getGuildState(guildId: string): GuildState {
		let state = this.guildStates.get(guildId);
		if (!state) {
			state = { configKey: null, channels: new Map() } satisfies GuildState;
			this.guildStates.set(guildId, state);
		}
		return state;
	}

	private getChannelState(guildId: string, channelId: string): ChannelActivityState {
		const guildState = this.getGuildState(guildId);
		let channelState = guildState.channels.get(channelId);
		if (!channelState) {
			channelState = {
				messageTimestamps: [],
				lastSlowmodeUpdate: 0,
				activeSlowmode: MIN_SLOWMODE_SECONDS,
				resetTimer: null
			};
			guildState.channels.set(channelId, channelState);
		}

		return channelState;
	}

	private async loadConfig(guildId: string): Promise<SlowmodeConfig | null> {
		try {
			const [settings, channels] = await Promise.all([
				this.database.guildSlowmodeSettings.findUnique({ where: { guildId } }),
				this.database.guildChannelSettings.findUnique({ where: { guildId } })
			]);

			if (!settings) return null;

			const enabledChannels = new Set<string>();
			if (channels) {
				this.parseStringArray(channels.automaticSlowmodeChannels).forEach((id) => enabledChannels.add(id));
			}

			return {
				enabled: settings.enabled,
				messageThreshold: settings.messageThreshold,
				messageTimeWindow: settings.messageTimeWindow,
				cooldownDuration: settings.cooldownDuration,
				resetTime: settings.resetTime,
				maxSlowmode: settings.maxSlowmode,
				channels: Array.from(enabledChannels)
			};
		} catch (error) {
			this.client.logger.error('Failed to load slowmode configuration', error, { guildId });
			return null;
		}
	}

	private async applyConfigChange(guildId: string, guildState: GuildState, config: SlowmodeConfig | null) {
		if (!config || !config.enabled) {
			await Promise.all(
				[...guildState.channels.entries()].map(async ([channelId, state]) => {
					await this.resetSlowmode(guildId, channelId, {
						providedState: state,
						reason: 'Automatic slowmode disabled for guild settings update.',
						prune: true
					});
				})
			);
			guildState.channels.clear();
			this.client.logger.info('[Slowmode] Automatic slowmode disabled for guild', { guildId });
			return;
		}

		const allowedChannels = new Set(config.channels);

		await Promise.all(
			[...guildState.channels.entries()].map(async ([channelId, state]) => {
				if (!allowedChannels.has(channelId)) {
					await this.resetSlowmode(guildId, channelId, {
						providedState: state,
						reason: 'Automatic slowmode channel removed from configuration.',
						prune: true
					});
					this.client.logger.info('[Slowmode] Channel removed from automatic management', {
						guildId,
						channelId
					});
					return;
				}

				if (state.resetTimer) {
					clearTimeout(state.resetTimer);
					state.resetTimer = null;
				}

				state.messageTimestamps.length = 0;
				state.lastSlowmodeUpdate = 0;
				state.activeSlowmode = MIN_SLOWMODE_SECONDS;
			})
		);
	}

	private async disableChannelIfTracked(
		guildId: string,
		channelId: string,
		options: { reason: string }
	) {
		const guildState = this.guildStates.get(guildId);
		if (!guildState) return;
		const state = guildState.channels.get(channelId);
		if (!state) return;
		await this.resetSlowmode(guildId, channelId, {
			providedState: state,
			reason: options.reason,
			prune: true
		});
		this.client.logger.debug('[Slowmode] Stopped tracking channel', {
			guildId,
			channelId,
			reason: options.reason
		});
	}

	private parseStringArray(value: string | null | undefined): string[] {
		if (!value) return [];
		try {
			const parsed = JSON.parse(value);
			if (!Array.isArray(parsed)) return [];
			return parsed.filter((entry): entry is string => typeof entry === 'string');
		} catch {
			return [];
		}
	}

	private createConfigKey(config: SlowmodeConfig | null): string {
		if (!config) return 'disabled';
		return [
			config.enabled ? '1' : '0',
			config.messageThreshold,
			config.messageTimeWindow,
			config.cooldownDuration,
			config.resetTime,
			config.maxSlowmode,
			...[...config.channels].sort()
		].join('|');
	}

	private isSlowmodeCapable(channel: Channel): channel is SlowmodeCapableChannel {
		return typeof (channel as Partial<SlowmodeCapableChannel>).setRateLimitPerUser === 'function';
	}

	private async fetchSlowmodeChannel(channelId: string): Promise<SlowmodeCapableChannel | null> {
		const existing = this.client.channels.cache.get(channelId) ?? (await this.client.channels.fetch(channelId).catch(() => null));
		if (!existing) return null;
		return this.isSlowmodeCapable(existing) ? (existing as SlowmodeCapableChannel) : null;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		slowmodeManager: SlowmodeManager;
	}
}
