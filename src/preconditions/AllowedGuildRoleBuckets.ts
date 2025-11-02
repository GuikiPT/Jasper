// AllowedGuildRoleBuckets module within preconditions
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommand, ContextMenuCommand, MessageCommand, Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';
import type { RoleBucketKey as RoleBucketKeyBase } from '../subcommands/settings/roles/utils';
type RoleBucketKey = RoleBucketKeyBase;

type AllowedGuildRoleBucketsContext = Precondition.Context & {
	buckets?: readonly RoleBucketKey[];
	allowManageGuild?: boolean;
	errorMessage?: string;
};

const DEFAULT_ERROR_MESSAGE = 'This command may only be used by users with proper roles.';

// Precondition enforcing AllowedGuildRoleBuckets access rules.
export class AllowedGuildRoleBucketsPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message, _command: MessageCommand, context: AllowedGuildRoleBucketsContext) {
		return this.checkMemberAccess(
			message.guildId,
			message.member,
			message.member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			true
		);
	}

	public override chatInputRun(interaction: ChatInputCommandInteraction, _command: ChatInputCommand, context: AllowedGuildRoleBucketsContext) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			false
		);
	}

	public override contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		_command: ContextMenuCommand,
		context: AllowedGuildRoleBucketsContext
	) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			false
		);
	}

	private async checkMemberAccess(
		guildId: string | null,
		member: GuildMember | APIInteractionGuildMember | null,
		hasManageGuild: boolean,
		context: AllowedGuildRoleBucketsContext,
		silentOnFail: boolean
	) {
		const { buckets, allowManageGuild, errorMessage } = this.resolveContext(context);

		if (!guildId || !member) {
			this.logDenial('missing-member', { guildId, member, buckets, allowManageGuild, silent: silentOnFail });
			return this.error({
				message: this.createErrorMessage([], buckets, allowManageGuild, errorMessage),
				context: silentOnFail ? { silent: true } : {}
			});
		}

		if (allowManageGuild && hasManageGuild) {
			this.logSuccess({
				guildId,
				member,
				buckets,
				allowManageGuild,
				grantedBy: 'manage-guild',
				silent: silentOnFail
			});
			return this.ok();
		}

		if (buckets.length === 0) {
			this.logDenial('no-buckets', { guildId, member, buckets, allowManageGuild, silent: silentOnFail });
			return this.error({
				message: this.createErrorMessage([], buckets, allowManageGuild, errorMessage),
				context: silentOnFail ? { silent: true } : {}
			});
		}

		const allowedRoles = await this.fetchAllowedRoles(guildId, buckets);

		if (allowedRoles.length === 0) {
			this.logDenial('no-config', {
				guildId,
				member,
				buckets,
				allowManageGuild,
				allowedRoles,
				silent: silentOnFail
			});
			return this.error({
				message: this.createErrorMessage([], buckets, allowManageGuild, errorMessage),
				context: silentOnFail ? { silent: true } : {}
			});
		}

		if (this.memberHasAllowedRole(member, allowedRoles)) {
			this.logSuccess({
				guildId,
				member,
				buckets,
				allowManageGuild,
				allowedRoles,
				silent: silentOnFail
			});
			return this.ok();
		}

		this.logDenial('forbidden', {
			guildId,
			member,
			buckets,
			allowManageGuild,
			allowedRoles,
			silent: silentOnFail
		});
		return this.error({
			message: this.createErrorMessage(allowedRoles, buckets, allowManageGuild, errorMessage),
			context: silentOnFail ? { silent: true } : {}
		});
	}

	private createErrorMessage(
		allowedRoles: string[],
		_buckets: readonly RoleBucketKey[],
		allowManageGuild: boolean,
		fallbackMessage: string
	): string {
		// If custom error message provided, use it
		if (fallbackMessage !== DEFAULT_ERROR_MESSAGE) {
			return fallbackMessage;
		}

		// Create descriptive message based on buckets and roles
		const permissions: string[] = [];

		if (allowManageGuild) {
			permissions.push('users with "Manage Server" permission');
		}

		if (allowedRoles.length > 0) {
			permissions.push('users with configured role permissions');
		}

		if (permissions.length === 0) {
			return 'This command may only be used by users with proper roles. No roles are currently configured.';
		}

		return `This command may only be used by ${permissions.join(' or ')}.`;
	}

	private resolveContext(context: AllowedGuildRoleBucketsContext) {
		return {
			buckets: Array.isArray(context.buckets) ? [...context.buckets] : [],
			allowManageGuild: context.allowManageGuild ?? false,
			errorMessage: context.errorMessage ?? DEFAULT_ERROR_MESSAGE
		};
	}

	private async fetchAllowedRoles(guildId: string, buckets: readonly RoleBucketKey[]) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[AllowedGuildRoleBuckets] Role settings service is unavailable');
			return [];
		}

		try {
			const allBuckets = await service.getAllBuckets(guildId);
			const roles = new Set<string>();

			for (const bucket of buckets) {
				const entries = allBuckets[bucket] ?? [];
				for (const entry of entries) {
					roles.add(entry);
				}
			}

			return [...roles];
		} catch (error) {
			this.container.logger.error('[AllowedGuildRoleBuckets] Failed to load guild role settings', error);
			return [];
		}
	}

	private memberHasAllowedRole(member: GuildMember | APIInteractionGuildMember, allowedRoles: string[]) {
		if ('roles' in member) {
			const roles = member.roles;
			if (Array.isArray(roles)) {
				return roles.some((roleId) => allowedRoles.includes(roleId));
			}
		}

		if ((member as GuildMember).roles?.cache) {
			return allowedRoles.some((roleId) => (member as GuildMember).roles.cache.has(roleId));
		}

		return false;
	}

	private logSuccess(details: BucketLogDetails & { grantedBy?: 'manage-guild' | 'roles' }) {
		const logger = this.container.logger;
		if (!logger) return;
		logger.debug('[AllowedGuildRoleBuckets] Access granted', this.buildMeta({ ...details, outcome: 'success' }));
	}

	private logDenial(reason: 'missing-member' | 'no-buckets' | 'no-config' | 'forbidden', details: BucketLogDetails) {
		const logger = this.container.logger;
		if (!logger) return;
		const meta = this.buildMeta({ ...details, outcome: 'denied', reason });
		const level = details.silent ? 'debug' : reason === 'forbidden' ? 'warn' : 'info';
		logger[level]('[AllowedGuildRoleBuckets] Access denied', meta);
	}

	private buildMeta({
		guildId,
		member,
		buckets,
		allowManageGuild,
		allowedRoles,
		silent,
		outcome,
		reason,
		grantedBy
	}: BucketLogDetails & { outcome: 'success' | 'denied'; reason?: string; grantedBy?: 'manage-guild' | 'roles' }) {
		return {
			outcome,
			reason: reason ?? null,
			grant: grantedBy ?? null,
			guildId: guildId ?? 'unknown',
			memberId: this.resolveMemberId(member),
			memberRoleIds: this.collectMemberRoles(member),
			buckets,
			allowManageGuild,
			allowedRoles: allowedRoles ?? [],
			silent: silent ?? false
		};
	}

	private resolveMemberId(member: GuildMember | APIInteractionGuildMember | null) {
		if (!member) return 'unknown';
		if ('user' in member && member.user) {
			return member.user.id;
		}
		return (member as GuildMember)?.id ?? 'unknown';
	}

	private collectMemberRoles(member: GuildMember | APIInteractionGuildMember | null) {
		if (!member) return [] as string[];
		if ('roles' in member) {
			const roles = member.roles;
			if (Array.isArray(roles)) {
				return [...roles];
			}
		}

		if ((member as GuildMember)?.roles?.cache) {
			return [...(member as GuildMember).roles.cache.keys()];
		}

		return [] as string[];
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		AllowedGuildRoleBuckets: AllowedGuildRoleBucketsContext;
	}
}

type BucketLogDetails = {
	guildId: string | null;
	member: GuildMember | APIInteractionGuildMember | null;
	buckets: readonly RoleBucketKey[];
	allowManageGuild: boolean;
	allowedRoles?: string[];
	silent?: boolean;
};
