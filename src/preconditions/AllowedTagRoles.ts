// AllowedTagRoles precondition - Restricts tag usage to users with configured tag or admin roles
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Log details for access attempts
 */
type LogDetails = {
	guildId: string | null;
	member: GuildMember | APIInteractionGuildMember | null;
	allowedRoles?: string[];
	allowedAdminRoles?: string[];
	silent?: boolean;
};

/**
 * Precondition that enforces tag usage access control
 * - Allows users with configured tag roles
 * - Allows users with configured tag admin roles
 * - No permission-based bypass (role-only access)
 * - Comprehensive audit logging
 * - Can be silent on message commands
 */
export class AllowedTagRolesPrecondition extends AllFlowsPrecondition {
	// ============================================================
	// Command Type Handlers
	// ============================================================

	/**
	 * Checks access for message commands (legacy)
	 * - Silent mode enabled (no error messages)
	 */
	public override messageRun(message: Message) {
		return this.checkMemberAccess(message.guildId, message.member, true);
	}

	/**
	 * Checks access for slash commands
	 */
	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null, false);
	}

	/**
	 * Checks access for context menu commands
	 */
	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null, false);
	}

	// ============================================================
	// Access Control Logic
	// ============================================================

	/**
	 * Core access check logic
	 * - Validates guild context
	 * - Checks both tag roles and admin roles
	 * - Logs all access attempts
	 * 
	 * @param guildId Guild ID or null for DMs
	 * @param member Member object or null
	 * @param silentOnFail Whether to suppress error messages
	 */
	private async checkMemberAccess(guildId: string | null, member: GuildMember | APIInteractionGuildMember | null, silentOnFail: boolean) {
		try {
			// Require guild context and valid member
			if (!guildId || !member) {
				this.logDenial('missing-member', { guildId, member, silent: silentOnFail });
				return this.error({
					message: this.createErrorMessage([], []),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Fetch both tag roles and admin roles in parallel
			const [allowedRoles, allowedAdminRoles] = await Promise.all([this.fetchAllowedRoles(guildId), this.fetchAllowedAdminRoles(guildId)]);

			// Deny if no roles configured in either bucket
			if (allowedRoles.length === 0 && allowedAdminRoles.length === 0) {
				this.logDenial('no-config', { guildId, member, silent: silentOnFail });
				return this.error({
					message: this.createErrorMessage([], []),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Check if member has any allowed role from either bucket
			if (
				(allowedRoles.length > 0 && this.memberHasAllowedRole(member, allowedRoles)) ||
				(allowedAdminRoles.length > 0 && this.memberHasAllowedRole(member, allowedAdminRoles))
			) {
				this.logSuccess({ guildId, member, allowedRoles, allowedAdminRoles, silent: silentOnFail });
				return this.ok();
			}

			// Deny access
			this.logDenial('forbidden', {
				guildId,
				member,
				allowedRoles,
				allowedAdminRoles,
				silent: silentOnFail
			});
			return this.error({
				message: this.createErrorMessage(allowedRoles, allowedAdminRoles),
				context: silentOnFail ? { silent: true } : {}
			});
		} catch (error) {
			this.container.logger.error('[AllowedTagRoles] Unhandled error during access check', error, {
				guildId,
				silentOnFail
			});

			return this.error({
				message: this.createErrorMessage([], []),
				context: silentOnFail ? { silent: true } : {}
			});
		}
	}

	// ============================================================
	// Helper Methods
	// ============================================================

	/**
	 * Creates user-friendly error message explaining access requirements
	 * - Mentions both role buckets
	 * 
	 * @param allowedRoles List of configured tag roles
	 * @param allowedAdminRoles List of configured tag admin roles
	 * @returns Error message string
	 */
	private createErrorMessage(allowedRoles: string[], allowedAdminRoles: string[]): string {
		const allRoles = [...allowedRoles, ...allowedAdminRoles];

		if (allRoles.length === 0) {
			return 'Support tags may only be used by users with "Allowed Tag Roles" or "Allowed Tag Admin Roles". No roles are currently configured.';
		}

		return 'Support tags may only be used by users with "Allowed Tag Roles" or "Allowed Tag Admin Roles".';
	}

	/**
	 * Fetches configured tag roles from database
	 * 
	 * @param guildId Guild ID
	 * @returns Array of role IDs or empty array on error
	 */
	private async fetchAllowedRoles(guildId: string) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[AllowedTagRoles] Role settings service is unavailable');
			return [];
		}

		try {
			return await service.listBucket(guildId, 'allowedTagRoles');
		} catch (error) {
			this.container.logger.error('[AllowedTagRoles] Failed to load allowed tag roles', error);
			return [];
		}
	}

	/**
	 * Fetches configured tag admin roles from database
	 * 
	 * @param guildId Guild ID
	 * @returns Array of role IDs or empty array on error
	 */
	private async fetchAllowedAdminRoles(guildId: string) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[AllowedTagRoles] Role settings service is unavailable');
			return [];
		}

		try {
			return await service.listBucket(guildId, 'allowedTagAdminRoles');
		} catch (error) {
			this.container.logger.error('[AllowedTagRoles] Failed to load allowed tag admin roles', error);
			return [];
		}
	}

	/**
	 * Checks if member has any of the allowed roles
	 * - Handles both API and GuildMember types
	 * - Supports array and cache-based role storage
	 * 
	 * @param member Member to check
	 * @param allowedRoles List of allowed role IDs
	 * @returns True if member has at least one allowed role
	 */
	private memberHasAllowedRole(member: GuildMember | APIInteractionGuildMember, allowedRoles: readonly string[]) {
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
	private logSuccess(details: LogDetails) {
		const logger = this.container.logger;
		if (!logger) return;
		logger.debug('[AllowedTagRoles] Access granted', this.buildMeta(details));
	}

	/**
	 * Logs access denials with appropriate severity
	 * - Debug level for silent failures
	 * - Warn level for forbidden access
	 * - Info level for configuration issues
	 */
	private logDenial(reason: 'missing-member' | 'no-config' | 'forbidden', details: LogDetails) {
		const logger = this.container.logger;
		if (!logger) return;
		const meta = { ...this.buildMeta(details), reason };
		const level = details.silent ? 'debug' : reason === 'forbidden' ? 'warn' : 'info';
		logger[level]('[AllowedTagRoles] Access denied', meta);
	}

	/**
	 * Builds structured metadata for logging
	 */
	private buildMeta({ guildId, member, allowedRoles, allowedAdminRoles, silent }: LogDetails) {
		return {
			guildId: guildId ?? 'unknown',
			memberId: this.resolveMemberId(member),
			memberRoleIds: this.collectMemberRoles(member),
			allowedRoles: allowedRoles ?? [],
			allowedAdminRoles: allowedAdminRoles ?? [],
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
		AllowedTagRoles: never;
	}
}
