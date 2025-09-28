import type { GuildSupportSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';

export const SUPPORT_SETTING_KEYS = ['supportForumChannelId', 'resolvedTagId'] as const satisfies readonly (keyof GuildSupportSettings)[];

export type SupportSettingKey = (typeof SUPPORT_SETTING_KEYS)[number];

export class GuildSupportSettingsService {
	public constructor(
		private readonly database: PrismaClient,
		private readonly guildSettingsService: GuildSettingsService
	) {}

	public async getSettings(guildId: string): Promise<GuildSupportSettings | null> {
		return this.database.guildSupportSettings.findUnique({ where: { guildId } });
	}

	public async getOrCreateSettings(guildId: string): Promise<GuildSupportSettings> {
		const existing = await this.getSettings(guildId);
		if (existing) return existing;

		await this.guildSettingsService.ensureGuild(guildId);
		return this.database.guildSupportSettings.create({ data: { guildId } });
	}

	public async setSetting(
		guildId: string,
		key: SupportSettingKey,
		value: string | null
	): Promise<GuildSupportSettings> {
		await this.guildSettingsService.ensureGuild(guildId);
		return this.database.guildSupportSettings.upsert({
			where: { guildId },
			create: {
				guildId,
				[key]: value
			},
			update: {
				[key]: value
			}
		});
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		guildSupportSettingsService: GuildSupportSettingsService;
	}
}
