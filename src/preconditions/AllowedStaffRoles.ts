// AllowedStaffRoles precondition - Restricts commands to users with configured staff roles
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

/**
 * Precondition that enforces staff-level access control
 * - Allows users with configured staff roles
 * - No permission-based bypass (role-only access)
 * - Can be silent on message commands (no error message shown)
 */
export class AllowedStaffRolesPrecondition extends AllFlowsPrecondition {
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
	 * - Verifies staff role membership
	 * - No permission-based bypass
	 * 
	 * @param guildId Guild ID or null for DMs
	 * @param member Member object or null
	 * @param silentOnFail Whether to suppress error messages
	 */
	private async checkMemberAccess(guildId: string | null, member: GuildMember | APIInteractionGuildMember | null, silentOnFail: boolean) {
		try {
			// Require guild context and valid member
			if (!guildId || !member) {
				return this.error({
					message: this.createErrorMessage([]),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Fetch configured staff roles
			const allowedRoles = await this.fetchAllowedRoles(guildId);

			// Deny if no staff roles configured
			if (allowedRoles.length === 0) {
				return this.error({
					message: this.createErrorMessage([]),
					context: silentOnFail ? { silent: true } : {}
				});
			}

			// Check if member has any allowed role
			if (this.memberHasAllowedRole(member, allowedRoles)) {
				return this.ok();
			}

			// Deny access
			return this.error({
				message: this.createErrorMessage(allowedRoles),
				context: silentOnFail ? { silent: true } : {}
			});
		} catch (error) {
			this.container.logger.error('[AllowedStaffRoles] Unhandled error during access check', error, {
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
	 * @param allowedRoles List of configured staff roles
	 * @returns Error message string
	 */
	private createErrorMessage(allowedRoles: string[]): string {
		if (allowedRoles.length === 0) {
			return 'Staff commands may only be used by users with "Allowed Staff Roles". No roles are currently configured.';
		}

		return 'Staff commands may only be used by users with "Allowed Staff Roles".';
	}

	/**
	 * Fetches configured staff roles from database
	 * 
	 * @param guildId Guild ID
	 * @returns Array of role IDs or empty array on error
	 */
	private async fetchAllowedRoles(guildId: string) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[AllowedStaffRoles] Role settings service is unavailable');
			return [];
		}

		try {
			return await service.listBucket(guildId, 'allowedStaffRoles');
		} catch (error) {
			this.container.logger.error('[AllowedStaffRoles] Failed to load guild role settings', error);
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
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/framework' {
	interface Preconditions {
		AllowedStaffRoles: never;
	}
}
