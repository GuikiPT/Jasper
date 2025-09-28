import type { GuildSettings, PrismaClient } from '@prisma/client';

export class GuildSettingsService {
	public constructor(private readonly database: PrismaClient) {}

	public async ensureGuild(guildId: string): Promise<GuildSettings> {
		return this.database.guildSettings.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});
	}

	public async getSettings(guildId: string): Promise<GuildSettings | null> {
		return this.database.guildSettings.findUnique({ where: { id: guildId } });
	}

	public async getPrefix(guildId: string): Promise<string | null> {
		const settings = await this.getSettings(guildId);
		return settings?.prefix ?? null;
	}

	public async setPrefix(guildId: string, prefix: string): Promise<void> {
		await this.database.guildSettings.upsert({
			where: { id: guildId },
			create: { id: guildId, prefix },
			update: { prefix }
		});
	}

	public async clearPrefix(guildId: string): Promise<void> {
		await this.database.guildSettings.upsert({
			where: { id: guildId },
			create: { id: guildId, prefix: null },
			update: { prefix: null }
		});
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		guildSettingsService: GuildSettingsService;
	}
}
