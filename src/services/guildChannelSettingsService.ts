import type { GuildChannelSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';

export const CHANNEL_BUCKET_KEYS = [
	'allowedSkullboardChannels',
	'allowedSnipeChannels',
	'allowedTagChannels',
	'automaticSlowmodeChannels'
] as const satisfies readonly (keyof GuildChannelSettings)[];

export type ChannelBucketKey = (typeof CHANNEL_BUCKET_KEYS)[number];

export class GuildChannelSettingsService {
	public constructor(
		private readonly database: PrismaClient,
		private readonly guildSettingsService: GuildSettingsService
	) {}

	public async getOrCreateSettings(guildId: string): Promise<GuildChannelSettings> {
		const existing = await this.database.guildChannelSettings.findUnique({ where: { guildId } });
		if (existing) return existing;

		await this.guildSettingsService.ensureGuild(guildId);

		return this.database.guildChannelSettings.create({
			data: this.createBlankSettings(guildId)
		});
	}

	public async getSettings(guildId: string): Promise<GuildChannelSettings | null> {
		return this.database.guildChannelSettings.findUnique({ where: { guildId } });
	}

	public async listBucket(guildId: string, bucket: ChannelBucketKey): Promise<string[]> {
		const settings = await this.getOrCreateSettings(guildId);
		return this.parseValue(settings[bucket]);
	}

	public async addChannel(
		guildId: string,
		bucket: ChannelBucketKey,
		channelId: string
	): Promise<{ added: boolean; channels: string[] }>
	{
		const settings = await this.getOrCreateSettings(guildId);
		const channels = this.parseValue(settings[bucket]);

		if (channels.includes(channelId)) {
			return { added: false, channels };
		}

		channels.push(channelId);
		await this.database.guildChannelSettings.update({
			where: { guildId },
			data: { [bucket]: JSON.stringify(channels) }
		});

		return { added: true, channels };
	}

	public async removeChannel(
		guildId: string,
		bucket: ChannelBucketKey,
		channelId: string
	): Promise<{ removed: boolean; channels: string[] }>
	{
		const settings = await this.getOrCreateSettings(guildId);
		const channels = this.parseValue(settings[bucket]);

		const index = channels.indexOf(channelId);
		if (index === -1) {
			return { removed: false, channels };
		}

		channels.splice(index, 1);
		await this.database.guildChannelSettings.update({
			where: { guildId },
			data: { [bucket]: JSON.stringify(channels) }
		});

		return { removed: true, channels };
	}

	public async replaceBucket(
		guildId: string,
		bucket: ChannelBucketKey,
		channels: Iterable<string>
	) {
		const uniqueChannels = Array.from(new Set(Array.from(channels)));
		await this.getOrCreateSettings(guildId);
		await this.database.guildChannelSettings.update({
			where: { guildId },
			data: { [bucket]: JSON.stringify(uniqueChannels) }
		});
	}

	public async getAllBuckets(guildId: string): Promise<Record<ChannelBucketKey, string[]>> {
		const settings = await this.getOrCreateSettings(guildId);
		return CHANNEL_BUCKET_KEYS.reduce((acc, bucket) => {
			acc[bucket] = this.parseValue(settings[bucket]);
			return acc;
		}, {} as Record<ChannelBucketKey, string[]>);
	}

	private parseValue(value: unknown): string[] {
		if (value === null || value === undefined) return [];

		if (Array.isArray(value)) {
			return value.filter((entry): entry is string => typeof entry === 'string');
		}

		if (typeof value === 'string') {
			if (value.length === 0) return [];
			try {
				const parsed = JSON.parse(value);
				return Array.isArray(parsed)
					? parsed.filter((entry): entry is string => typeof entry === 'string')
					: [];
			} catch {
				return [];
			}
		}

		if (Buffer.isBuffer(value)) {
			return this.parseValue(value.toString('utf8'));
		}

		return [];
	}

	private createBlankSettings(guildId: string) {
		return {
			guildId,
			allowedSkullboardChannels: JSON.stringify([]),
			allowedSnipeChannels: JSON.stringify([]),
			allowedTagChannels: JSON.stringify([]),
			automaticSlowmodeChannels: JSON.stringify([])
		};
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		guildChannelSettingsService: GuildChannelSettingsService;
	}
}
