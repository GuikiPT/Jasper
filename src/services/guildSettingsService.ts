// guildSettingsService module within services
import type { GuildSettings, PrismaClient } from '@prisma/client';

// Provides high-level helpers for reading and mutating core guild settings.
export class GuildSettingsService {
	public constructor(private readonly database: PrismaClient) {}

	// Ensures a guild row exists, returning the resulting settings entity.
	public async ensureGuild(guildId: string): Promise<GuildSettings> {
		return this.database.guildSettings.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});
	}

	// Retrieves the persisted guild settings when available.
	public async getSettings(guildId: string): Promise<GuildSettings | null> {
		return this.database.guildSettings.findUnique({ where: { id: guildId } });
	}

	// Reads the custom prefix override if defined, otherwise null.
	public async getPrefix(guildId: string): Promise<string | null> {
		const settings = await this.getSettings(guildId);
		return settings?.prefix ?? null;
	}

	// Creates or updates the guild prefix accordingly.
	public async setPrefix(guildId: string, prefix: string): Promise<void> {
		await this.database.guildSettings.upsert({
			where: { id: guildId },
			create: { id: guildId, prefix },
			update: { prefix }
		});
	}

	// Clears the prefix, falling back to the default Sapphire prefix.
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
