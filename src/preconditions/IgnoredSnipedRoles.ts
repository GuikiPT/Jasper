// IgnoredSnipedRoles precondition - Restricts commands to users with ignored sniped roles
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

/**
 * Precondition that enforces ignored sniped roles access control
 * - Allows users with configured ignored sniped roles
 * - Used to restrict access to snipe-related commands
 * - No permission-based bypass (role-only access)
 * - Can be silent on message commands
 */
export class IgnoredSnipedRolesPrecondition extends AllFlowsPrecondition {
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
	 * - Verifies ignored sniped role membership
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

			// Fetch configured ignored sniped roles
			const allowedRoles = await this.fetchRoles(guildId);

			// Deny if no roles configured
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
			this.container.logger.error('[IgnoredSnipedRoles] Unhandled error during access check', error, {
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
	 * @param allowedRoles List of configured ignored sniped roles
	 * @returns Error message string
	 */
	private createErrorMessage(allowedRoles: string[]): string {
		if (allowedRoles.length === 0) {
			return 'This command may only be used by users with "Ignored Sniped Roles". No roles are currently configured.';
		}

		return 'This command may only be used by users with "Ignored Sniped Roles".';
	}

	/**
	 * Fetches configured ignored sniped roles from database
	 * 
	 * @param guildId Guild ID
	 * @returns Array of role IDs or empty array on error
	 */
	private async fetchRoles(guildId: string) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[IgnoredSnipedRoles] Role settings service is unavailable');
			return [];
		}

		try {
			return await service.listBucket(guildId, 'ignoredSnipedRoles');
		} catch (error) {
			this.container.logger.error('[IgnoredSnipedRoles] Failed to load guild role settings', error);
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
		IgnoredSnipedRoles: never;
	}
}
