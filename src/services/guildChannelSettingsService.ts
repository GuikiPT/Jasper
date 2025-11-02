// guildChannelSettingsService module within services
import type { GuildChannelSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { BaseBucketSettingsService } from './baseBucketSettingsService';

export const CHANNEL_BUCKET_KEYS = [
	'allowedSnipeChannels',
	'allowedTagChannels',
	'automaticSlowmodeChannels'
] as const satisfies readonly (keyof GuildChannelSettings)[];

export type ChannelBucketKey = (typeof CHANNEL_BUCKET_KEYS)[number];

export class GuildChannelSettingsService extends BaseBucketSettingsService<GuildChannelSettings, ChannelBucketKey> {
	public constructor(database: PrismaClient, guildSettingsService: GuildSettingsService) {
		super(database, guildSettingsService);
	}

	protected async getOrCreateSettings(guildId: string): Promise<GuildChannelSettings> {
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
		return { added: result.added, channels: result.items };
	}

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
		return { removed: result.removed, channels: result.items };
	}

	public async replaceBucket(guildId: string, bucket: ChannelBucketKey, channels: Iterable<string>) {
		await this.replaceBucketContents(guildId, bucket, channels, async (guildId, bucket, data) => {
			await this.database.guildChannelSettings.update({
				where: { guildId },
				data: { [bucket]: data }
			});
		});
	}

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

	private createBlankSettings(guildId: string) {
		return {
			guildId,
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
