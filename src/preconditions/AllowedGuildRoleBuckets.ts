// AllowedGuildRoleBuckets precondition - Flexible role-based access control with bucket system
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommand, ContextMenuCommand, MessageCommand, Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';
import type { RoleBucketKey as RoleBucketKeyBase } from '../subcommands/settings/roles/utils';

type RoleBucketKey = RoleBucketKeyBase;

// ============================================================
// Type Definitions
// ============================================================

/**
 * Precondition context for bucket-based role checks
 */
type AllowedGuildRoleBucketsContext = Precondition.Context & {
	buckets?: readonly RoleBucketKey[];
	allowManageGuild?: boolean;
	errorMessage?: string;
};

/**
 * Log details for access attempts
 */
type BucketLogDetails = {
	guildId: string | null;
	member: GuildMember | APIInteractionGuildMember | null;
	buckets: readonly RoleBucketKey[];
	allowManageGuild: boolean;
	allowedRoles?: string[];
	silent?: boolean;
};

const DEFAULT_ERROR_MESSAGE = 'This command may only be used by users with proper roles.';

/**
 * Precondition that enforces bucket-based role access control
 * - Supports multiple role buckets (e.g., staff, moderators, support)
 * - Optional Manage Server permission bypass
 * - Customizable error messages
 * - Comprehensive audit logging
 */
export class AllowedGuildRoleBucketsPrecondition extends AllFlowsPrecondition {
	// ============================================================
	// Command Type Handlers
	// ============================================================

	/**
	 * Checks access for message commands (legacy)
	 * - Silent mode enabled (no error messages)
	 */
	public override messageRun(message: Message, _command: MessageCommand, context: AllowedGuildRoleBucketsContext) {
		return this.checkMemberAccess(
			message.guildId,
			message.member,
			message.member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			true // Silent on fail for message commands
		);
	}

	/**
	 * Checks access for slash commands
	 */
	public override chatInputRun(interaction: ChatInputCommandInteraction, _command: ChatInputCommand, context: AllowedGuildRoleBucketsContext) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			false
		);
	}

	/**
	 * Checks access for context menu commands
	 */
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

	// ============================================================
	// Access Control Logic
	// ============================================================

	/**
	 * Core access check logic
	 * - Validates guild context
	 * - Checks Manage Server permission (if enabled)
	 * - Verifies role membership across buckets
	 * - Logs all access attempts
	 * 
	 * @param guildId Guild ID or null for DMs
	 * @param member Member object or null
	 * @param hasManageGuild Whether member has Manage Server permission
	 * @param context Precondition context with buckets and options
	 * @param silentOnFail Whether to suppress error messages
	 */
	private async checkMemberAccess(
		guildId: string | null,
		member: GuildMember | APIInteractionGuildMember | null,
		hasManageGuild: boolean,
		context: AllowedGuildRoleBucketsContext,
		silentOnFail: boolean
	) {
		const { buckets, allowManageGuild, errorMessage } = this.resolveContext(context);
		try {
			// Require guild context and valid member
			if (!guildId || !member) {
				this.logDenial('missing-member', { guildId, member, buckets, allowManageGuild, silent: silentOnFail });
				return this.error({
					message: this.createErrorMessage([], buckets, allowManageGuild, errorMessage),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Allow if member has Manage Server permission and it's enabled
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

			// Deny if no buckets specified
			if (buckets.length === 0) {
				this.logDenial('no-buckets', { guildId, member, buckets, allowManageGuild, silent: silentOnFail });
				return this.error({
					message: this.createErrorMessage([], buckets, allowManageGuild, errorMessage),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Fetch allowed roles from all specified buckets
			const allowedRoles = await this.fetchAllowedRoles(guildId, buckets);

			// Deny if no roles configured in buckets
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

			// Check if member has any allowed role
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

			// Deny access
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
		} catch (error) {
			this.container.logger.error('[AllowedGuildRoleBuckets] Unhandled error during access check', error, {
				guildId,
				hasManageGuild,
				buckets,
				allowManageGuild,
				silentOnFail
			});

			return this.error({
				message: this.createErrorMessage([], buckets, allowManageGuild, errorMessage),
				context: silentOnFail ? { silent: true } : {}
			});
		}
	}

	// ============================================================
	// Helper Methods
	// ============================================================

	/**
	 * Creates user-friendly error message explaining access requirements
	 * - Uses custom message if provided
	 * - Falls back to dynamic message based on configuration
	 */
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

		// Create descriptive message based on configuration
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

	/**
	 * Resolves and normalizes precondition context
	 * - Ensures buckets is an array
	 * - Sets default values for optional fields
	 */
	private resolveContext(context: AllowedGuildRoleBucketsContext) {
		return {
			buckets: Array.isArray(context.buckets) ? [...context.buckets] : [],
			allowManageGuild: context.allowManageGuild ?? false,
			errorMessage: context.errorMessage ?? DEFAULT_ERROR_MESSAGE
		};
	}

	/**
	 * Fetches allowed roles from multiple buckets
	 * - Aggregates roles from all specified buckets
	 * - Deduplicates role IDs
	 * 
	 * @param guildId Guild ID
	 * @param buckets Role bucket keys to fetch
	 * @returns Array of unique role IDs
	 */
	private async fetchAllowedRoles(guildId: string, buckets: readonly RoleBucketKey[]) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[AllowedGuildRoleBuckets] Role settings service is unavailable');
			return [];
		}

		try {
			const allBuckets = await service.getAllBuckets(guildId);
			const roles = new Set<string>();

			// Aggregate roles from all requested buckets
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

	/**
	 * Checks if member has any of the allowed roles
	 * - Handles both API and GuildMember types
	 * - Supports array and cache-based role storage
	 */
	private memberHasAllowedRole(member: GuildMember | APIInteractionGuildMember, allowedRoles: string[]) {
		// Handle API interaction member (roles as array)
		if ('roles' in member) {
			const roles = member.roles;
			if (Array.isArray(roles)) {
				return roles.some((roleId) => allowedRoles.includes(roleId));
			}
		}

		// Handle GuildMember (roles as cache)
		if ((member as GuildMember).roles?.cache) {
			return allowedRoles.some((roleId) => (member as GuildMember).roles.cache.has(roleId));
		}

		return false;
	}

	// ============================================================
	// Audit Logging
	// ============================================================

	/**
	 * Logs successful access grants
	 */
	private logSuccess(details: BucketLogDetails & { grantedBy?: 'manage-guild' | 'roles' }) {
		const logger = this.container.logger;
		if (!logger) return;
		logger.debug('[AllowedGuildRoleBuckets] Access granted', this.buildMeta({ ...details, outcome: 'success' }));
	}

	/**
	 * Logs access denials with appropriate severity
	 * - Debug level for silent failures
	 * - Warn level for forbidden access
	 * - Info level for configuration issues
	 */
	private logDenial(reason: 'missing-member' | 'no-buckets' | 'no-config' | 'forbidden', details: BucketLogDetails) {
		const logger = this.container.logger;
		if (!logger) return;
		const meta = this.buildMeta({ ...details, outcome: 'denied', reason });
		const level = details.silent ? 'debug' : reason === 'forbidden' ? 'warn' : 'info';
		logger[level]('[AllowedGuildRoleBuckets] Access denied', meta);
	}

	/**
	 * Builds structured metadata for logging
	 */
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

	/**
	 * Resolves member ID from member object
	 */
	private resolveMemberId(member: GuildMember | APIInteractionGuildMember | null) {
		if (!member) return 'unknown';
		if ('user' in member && member.user) {
			return member.user.id;
		}
		return (member as GuildMember)?.id ?? 'unknown';
	}

	/**
	 * Collects all role IDs from member
	 */
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

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/framework' {
	interface Preconditions {
		AllowedGuildRoleBuckets: AllowedGuildRoleBucketsContext;
	}
}
