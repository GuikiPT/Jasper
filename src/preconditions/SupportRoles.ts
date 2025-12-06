// SupportRoles precondition - Restricts support commands to users with configured support roles
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Log details for access attempts
 */
type SupportLogDetails = {
	guildId: string | null;
	member: GuildMember | APIInteractionGuildMember | null;
	allowedRoles?: string[];
	silent?: boolean;
};

/**
 * Precondition that enforces support role access control
 * - Allows users with configured support roles
 * - No permission-based bypass (role-only access)
 * - Comprehensive audit logging
 * - Can be silent on message commands
 */
export class SupportRolesPrecondition extends AllFlowsPrecondition {
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
	 * - Verifies support role membership
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
					message: this.createErrorMessage([]),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Fetch configured support roles
			const allowedRoles = await this.fetchRoles(guildId);

			// Deny if no support roles configured
			if (allowedRoles.length === 0) {
				this.logDenial('no-config', { guildId, member, allowedRoles, silent: silentOnFail });
				return this.error({
					message: this.createErrorMessage([]),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Check if member has any allowed role
			if (this.memberHasAllowedRole(member, allowedRoles)) {
				this.logSuccess({ guildId, member, allowedRoles, silent: silentOnFail });
				return this.ok();
			}

			// Deny access
			this.logDenial('forbidden', { guildId, member, allowedRoles, silent: silentOnFail });
			return this.error({
				message: this.createErrorMessage(allowedRoles),
				context: silentOnFail ? { silent: true } : {}
			});
		} catch (error) {
			this.container.logger.error('[SupportRoles] Unhandled error during access check', error, {
				guildId,
				silentOnFail
			});

			return this.error({
				message: this.createErrorMessage([]),
				context: silentOnFail ? { silent: true } : {}
			});
		}
	}

	// ============================================================
	// Helper Methods
	// ============================================================

	/**
	 * Creates user-friendly error message explaining access requirements
	 * 
	 * @param allowedRoles List of configured support roles
	 * @returns Error message string
	 */
	private createErrorMessage(allowedRoles: string[]): string {
		if (allowedRoles.length === 0) {
			return 'Support commands may only be used by users with "Support Roles". No roles are currently configured.';
		}

		return 'Support commands may only be used by users with "Support Roles".';
	}

	/**
	 * Fetches configured support roles from database
	 * 
	 * @param guildId Guild ID
	 * @returns Array of role IDs or empty array on error
	 */
	private async fetchRoles(guildId: string) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[SupportRoles] Role settings service is unavailable');
			return [];
		}

		try {
			return await service.listBucket(guildId, 'supportRoles');
		} catch (error) {
			this.container.logger.error('[SupportRoles] Failed to load support roles', error);
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
	private logSuccess(details: SupportLogDetails) {
		const logger = this.container.logger;
		if (!logger) return;
		logger.debug('[SupportRoles] Access granted', this.buildMeta(details));
	}

	/**
	 * Logs access denials with appropriate severity
	 * - Debug level for silent failures
	 * - Warn level for forbidden access
	 * - Info level for configuration issues
	 */
	private logDenial(reason: 'missing-member' | 'no-config' | 'forbidden', details: SupportLogDetails) {
		const logger = this.container.logger;
		if (!logger) return;
		const meta = { ...this.buildMeta(details), reason };
		const level = details.silent ? 'debug' : reason === 'forbidden' ? 'warn' : 'info';
		logger[level]('[SupportRoles] Access denied', meta);
	}

	/**
	 * Builds structured metadata for logging
	 */
	private buildMeta({ guildId, member, allowedRoles, silent }: SupportLogDetails) {
		return {
			guildId: guildId ?? 'unknown',
			memberId: this.resolveMemberId(member),
			memberRoleIds: this.collectMemberRoles(member),
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
		SupportRoles: never;
	}
}
