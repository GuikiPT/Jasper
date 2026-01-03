// AllowedAdminRoles precondition - Restricts commands to administrators or configured admin roles
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

/**
 * Precondition that enforces admin-level access control
 * - Allows users with Administrator permission
 * - Allows users with configured admin roles
 * - Can be silent on message commands (no error message shown)
 */
export class AllowedAdminRolesPrecondition extends AllFlowsPrecondition {
	// ============================================================
	// Command Type Handlers
	// ============================================================

	/**
	 * Checks access for message commands (legacy)
	 * - Silent mode enabled (no error messages)
	 */
	public override messageRun(message: Message) {
		return this.checkMemberAccess(
			message.guildId,
			message.member,
			message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false,
			true // Silent on fail for message commands
		);
	}

	/**
	 * Checks access for slash commands
	 */
	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false,
			false
		);
	}

	/**
	 * Checks access for context menu commands
	 */
	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false,
			false
		);
	}

	// ============================================================
	// Access Control Logic
	// ============================================================

	/**
	 * Core access check logic
	 * - Validates guild context
	 * - Checks Administrator permission
	 * - Verifies admin role membership
	 * 
	 * @param guildId Guild ID or null for DMs
	 * @param member Member object or null
	 * @param hasAdministrator Whether member has Administrator permission
	 * @param silentOnFail Whether to suppress error messages
	 */
	private async checkMemberAccess(
		guildId: string | null,
		member: GuildMember | APIInteractionGuildMember | null,
		hasAdministrator: boolean,
		silentOnFail: boolean
	) {
		try {
			// Require guild context and valid member
			if (!guildId || !member) {
				this.logDenial('missing-member', { guildId, memberId: this.resolveMemberId(member), hasAdministrator, silentOnFail });
				return this.error({
					message: this.createErrorMessage([]),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Allow if member has Administrator permission
			if (hasAdministrator) {
				this.logGrant('administrator', { guildId, memberId: this.resolveMemberId(member), hasAdministrator });
				return this.ok();
			}

			// Fetch configured admin roles
			const allowedRoles = await this.fetchAllowedAdminRoles(guildId);

			// Deny if no admin roles configured
			if (allowedRoles.length === 0) {
				this.logDenial('no-config', { guildId, memberId: this.resolveMemberId(member), hasAdministrator, silentOnFail });
				return this.error({
					message: this.createErrorMessage([]),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Check if member has any allowed role
			if (this.memberHasAllowedRole(member, allowedRoles)) {
				this.logGrant('role', {
					guildId,
					memberId: this.resolveMemberId(member),
					hasAdministrator,
					allowedRoles
				});
				return this.ok();
			}

			// Deny access
			this.logDenial('forbidden', {
				guildId,
				memberId: this.resolveMemberId(member),
				hasAdministrator,
				allowedRoles,
				silentOnFail
			});
			return this.error({
				message: this.createErrorMessage(allowedRoles),
				context: silentOnFail ? { silent: true } : {}
			});
		} catch (error) {
			this.container.logger.error('[AllowedAdminRoles] Unhandled error during access check', error, {
				guildId,
				hasAdministrator,
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
	 * @param allowedRoles List of configured admin roles
	 * @returns Error message string
	 */
	private createErrorMessage(allowedRoles: string[]): string {
		const permissions: string[] = [];

		// Always mention Administrator permission as valid option
		permissions.push('users with "Administrator" permission');

		if (allowedRoles.length > 0) {
			permissions.push('users with "Allowed Admin Roles"');
		}

		if (permissions.length === 1 && allowedRoles.length === 0) {
			return 'Admin commands may only be used by users with "Administrator" permission. No admin roles are currently configured.';
		}

		return `Admin commands may only be used by ${permissions.join(' or ')}.`;
	}

	/**
	 * Fetches configured admin roles from database
	 * 
	 * @param guildId Guild ID
	 * @returns Array of role IDs or empty array on error
	 */
	private async fetchAllowedAdminRoles(guildId: string) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[AllowedAdminRoles] Role settings service is unavailable');
			return [];
		}

		try {
			return await service.listBucket(guildId, 'allowedAdminRoles');
		} catch (error) {
			this.container.logger.error('[AllowedAdminRoles] Failed to load guild role settings', error);
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
			const roles = (member as APIInteractionGuildMember).roles;
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

	private resolveMemberId(member: GuildMember | APIInteractionGuildMember | null) {
		if (!member) return 'unknown';
		if ('user' in member && member.user) return member.user.id;
		return (member as GuildMember)?.id ?? 'unknown';
	}

	private logGrant(source: 'administrator' | 'role', meta: { guildId: string; memberId: string; hasAdministrator: boolean; allowedRoles?: string[] }) {
		this.container.logger.debug('[AllowedAdminRoles] Access granted', {
			source,
			guildId: meta.guildId,
			memberId: meta.memberId,
			hasAdministrator: meta.hasAdministrator,
			allowedRoles: meta.allowedRoles ?? []
		});
	}

	private logDenial(
		reason: 'missing-member' | 'no-config' | 'forbidden',
		meta: { guildId: string | null; memberId: string; hasAdministrator: boolean; allowedRoles?: string[]; silentOnFail: boolean }
	) {
		const level = meta.silentOnFail ? 'debug' : reason === 'forbidden' ? 'warn' : 'info';
		this.container.logger[level]('[AllowedAdminRoles] Access denied', {
			reason,
			guildId: meta.guildId ?? 'unknown',
			memberId: meta.memberId,
			hasAdministrator: meta.hasAdministrator,
			allowedRoles: meta.allowedRoles ?? [],
			silent: meta.silentOnFail
		});
	}
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/framework' {
	interface Preconditions {
		AllowedAdminRoles: never;
	}
}
