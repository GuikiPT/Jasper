// OwnerOnly precondition - Restricts commands to bot owners defined in environment
import { AllFlowsPrecondition } from '@sapphire/framework';
import { envParseArray } from '@skyra/env-utilities';
import type { CommandInteraction, ContextMenuCommandInteraction, Message, Snowflake } from 'discord.js';

// ============================================================
// Constants
// ============================================================

// Bot owner user IDs from environment variable
const OWNERS = envParseArray('OWNERS');

/**
 * Precondition that enforces bot owner-only access
 * - Only allows users listed in OWNERS environment variable
 * - No role or permission bypass
 * - Works across all command types
 */
export class UserPrecondition extends AllFlowsPrecondition {
	#message = 'Owner commands may only be used by the bot owner.';

	// ============================================================
	// Command Type Handlers
	// ============================================================

	/**
	 * Checks access for slash commands
	 */
	public override chatInputRun(interaction: CommandInteraction) {
		try {
			return this.doOwnerCheck(interaction.user.id);
		} catch (error) {
			this.container.logger.error('[OwnerOnly] Unhandled error during owner check', error, {
				userId: interaction.user.id
			});
			return this.error({ message: this.#message });
		}
	}

	/**
	 * Checks access for context menu commands
	 */
	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		try {
			return this.doOwnerCheck(interaction.user.id);
		} catch (error) {
			this.container.logger.error('[OwnerOnly] Unhandled error during owner check', error, {
				userId: interaction.user.id
			});
			return this.error({ message: this.#message });
		}
	}

	/**
	 * Checks access for message commands (legacy)
	 */
	public override messageRun(message: Message) {
		try {
			return this.doOwnerCheck(message.author.id);
		} catch (error) {
			this.container.logger.error('[OwnerOnly] Unhandled error during owner check', error, {
				userId: message.author.id
			});
			return this.error({ message: this.#message });
		}
	}

	// ============================================================
	// Access Control Logic
	// ============================================================

	/**
	 * Checks if user ID is in the owners list
	 * 
	 * @param userId User ID to check
	 * @returns Success if user is owner, error otherwise
	 */
	private doOwnerCheck(userId: Snowflake) {
		const isOwner = OWNERS.includes(userId);
		if (isOwner) {
			this.container.logger.debug('[OwnerOnly] Access granted', { userId });
			return this.ok();
		}

		this.container.logger.warn('[OwnerOnly] Access denied', { userId });
		return this.error({ message: this.#message });
	}
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/framework' {
	interface Preconditions {
		OwnerOnly: never;
	}
}
