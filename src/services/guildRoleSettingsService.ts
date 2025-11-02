// guildRoleSettingsService module within services
import type { GuildRoleSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { BaseBucketSettingsService } from './baseBucketSettingsService';

export const ROLE_BUCKET_KEYS = [
	'allowedAdminRoles',
	'allowedStaffRoles',
	'allowedTagAdminRoles',
	'allowedTagRoles',
	'ignoredSnipedRoles',
	'supportRoles'
] as const satisfies readonly (keyof GuildRoleSettings)[];

export type RoleBucketKey = (typeof ROLE_BUCKET_KEYS)[number];

// Manages the collection of role buckets controlling command access per guild.
export class GuildRoleSettingsService extends BaseBucketSettingsService<GuildRoleSettings, RoleBucketKey> {
	public constructor(database: PrismaClient, guildSettingsService: GuildSettingsService) {
		super(database, guildSettingsService);
	}

	// Fetches settings or initialises them alongside core guild settings.
	protected async getOrCreateSettings(guildId: string): Promise<GuildRoleSettings> {
		const existing = await this.database.guildRoleSettings.findUnique({ where: { guildId } });
		if (existing) return existing;

		await this.guildSettingsService.ensureGuild(guildId);

		return this.database.guildRoleSettings.create({
			data: this.createBlankSettings(guildId)
		});
	}

	// Returns the cached role settings document when it exists.
	public async getSettings(guildId: string): Promise<GuildRoleSettings | null> {
		return this.database.guildRoleSettings.findUnique({ where: { guildId } });
	}

	// Lists the role IDs stored for a specific bucket.
	public async listBucket(guildId: string, bucket: RoleBucketKey): Promise<string[]> {
		const settings = await this.getOrCreateSettings(guildId);
		return this.parseValue(settings[bucket]);
	}

	// Adds a role to the requested bucket, returning whether the role was new.
	public async addRole(guildId: string, bucket: RoleBucketKey, roleId: string): Promise<{ added: boolean; roles: string[] }> {
		const result = await this.addItemToBucket(
			guildId,
			bucket,
			roleId,
			(settings) => settings[bucket],
			async (guildId, bucket, data) => {
				await this.database.guildRoleSettings.update({
					where: { guildId },
					data: { [bucket]: data }
				});
			}
		);
		return { added: result.added, roles: result.items };
	}

	// Removes a role from the bucket, reporting removal status.
	public async removeRole(guildId: string, bucket: RoleBucketKey, roleId: string): Promise<{ removed: boolean; roles: string[] }> {
		const result = await this.removeItemFromBucket(
			guildId,
			bucket,
			roleId,
			(settings) => settings[bucket],
			async (guildId, bucket, data) => {
				await this.database.guildRoleSettings.update({
					where: { guildId },
					data: { [bucket]: data }
				});
			}
		);
		return { removed: result.removed, roles: result.items };
	}

	// Replaces the entire bucket contents with the provided collection.
	public async replaceBucket(guildId: string, bucket: RoleBucketKey, roles: Iterable<string>) {
		await this.replaceBucketContents(guildId, bucket, roles, async (guildId, bucket, data) => {
			await this.database.guildRoleSettings.update({
				where: { guildId },
				data: { [bucket]: data }
			});
		});
	}

	// Resolves all buckets at once to reduce round-trips where needed.
	public async getAllBuckets(guildId: string): Promise<Record<RoleBucketKey, string[]>> {
		const settings = await this.getOrCreateSettings(guildId);
		return ROLE_BUCKET_KEYS.reduce(
			(acc, bucket) => {
				acc[bucket] = this.parseValue(settings[bucket]);
				return acc;
			},
			{} as Record<RoleBucketKey, string[]>
		);
	}

	private createBlankSettings(guildId: string) {
		return {
			guildId,
			allowedAdminRoles: JSON.stringify([]),
			allowedStaffRoles: JSON.stringify([]),
			allowedTagAdminRoles: JSON.stringify([]),
			allowedTagRoles: JSON.stringify([]),
			ignoredSnipedRoles: JSON.stringify([]),
			supportRoles: JSON.stringify([])
		};
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		guildRoleSettingsService: GuildRoleSettingsService;
	}
}
