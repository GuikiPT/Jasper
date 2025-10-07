// guildRoleSettingsService module within services
import type { GuildRoleSettings, PrismaClient } from '@prisma/client';
import { GuildSettingsService } from './guildSettingsService';
import { Logger } from '../lib/logger';

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
export class GuildRoleSettingsService {
	public constructor(
		private readonly database: PrismaClient,
		private readonly guildSettingsService: GuildSettingsService
	) {}

	// Fetches settings or initialises them alongside core guild settings.
	public async getOrCreateSettings(guildId: string): Promise<GuildRoleSettings> {
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
	public async addRole(guildId: string, bucket: RoleBucketKey, roleId: string): Promise<{ added: boolean; roles: string[] }>
	{
		const settings = await this.getOrCreateSettings(guildId);
		const roles = this.parseValue(settings[bucket]);

		if (roles.includes(roleId)) {
			return { added: false, roles };
		}

		roles.push(roleId);
		await this.database.guildRoleSettings.update({
			where: { guildId },
			data: { [bucket]: JSON.stringify(roles) }
		});

		return { added: true, roles };
	}

	// Removes a role from the bucket, reporting removal status.
	public async removeRole(
		guildId: string,
		bucket: RoleBucketKey,
		roleId: string
	): Promise<{ removed: boolean; roles: string[] }>
	{
		const settings = await this.getOrCreateSettings(guildId);
		const roles = this.parseValue(settings[bucket]);

		const index = roles.indexOf(roleId);
		if (index === -1) {
			return { removed: false, roles };
		}

		roles.splice(index, 1);
		await this.database.guildRoleSettings.update({
			where: { guildId },
			data: { [bucket]: JSON.stringify(roles) }
		});

		return { removed: true, roles };
	}

	// Replaces the entire bucket contents with the provided collection.
	public async replaceBucket(guildId: string, bucket: RoleBucketKey, roles: Iterable<string>) {
		const uniqueRoles = Array.from(new Set(Array.from(roles)));
		await this.getOrCreateSettings(guildId);
		await this.database.guildRoleSettings.update({
			where: { guildId },
			data: { [bucket]: JSON.stringify(uniqueRoles) }
		});
	}

	// Resolves all buckets at once to reduce round-trips where needed.
	public async getAllBuckets(guildId: string): Promise<Record<RoleBucketKey, string[]>> {
		const settings = await this.getOrCreateSettings(guildId);
		return ROLE_BUCKET_KEYS.reduce((acc, bucket) => {
			acc[bucket] = this.parseValue(settings[bucket]);
			return acc;
		}, {} as Record<RoleBucketKey, string[]>);
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
			} catch (error) {
				Logger.debug('Failed to parse role bucket JSON', { error });
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
