// guildSlowmodeSettingsService module within services
import type { GuildSlowmodeSettings, Prisma, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';

export class GuildSlowmodeSettingsService {
	public constructor(
		private readonly database: PrismaClient,
		private readonly guildSettingsService: GuildSettingsService
	) {}

	public async getOrCreateSettings(guildId: string): Promise<GuildSlowmodeSettings> {
		const existing = await this.database.guildSlowmodeSettings.findUnique({ where: { guildId } });
		if (existing) return existing;

		await this.guildSettingsService.ensureGuild(guildId);

		const createData: Prisma.GuildSlowmodeSettingsUncheckedCreateInput = { guildId };

		return this.database.guildSlowmodeSettings.create({ data: createData });
	}

	public async getSettings(guildId: string): Promise<GuildSlowmodeSettings | null> {
		return this.database.guildSlowmodeSettings.findUnique({ where: { guildId } });
	}

	public async updateSettings(
		guildId: string,
		updates: Partial<
			Pick<GuildSlowmodeSettings, 'enabled' | 'messageThreshold' | 'messageTimeWindow' | 'cooldownDuration' | 'resetTime' | 'maxSlowmode'>
		>
	): Promise<GuildSlowmodeSettings> {
		await this.getOrCreateSettings(guildId);
		return this.database.guildSlowmodeSettings.update({
			where: { guildId },
			data: updates
		});
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		guildSlowmodeSettingsService: GuildSlowmodeSettingsService;
	}
}
