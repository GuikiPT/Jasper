// Message create listener - Handles automatic slowmode, support thread monitoring, and legacy bot cleanup
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Message, GuildMember } from 'discord.js';

// ============================================================
// Constants
// ============================================================

// Legacy bot IDs for message cleanup
const WOBIN_BOT_ID = '1223012641543426088';
const LAWREN_BOT_ID = '1306785011256659968';

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class AutomaticSlowmodeListener extends Listener<typeof Events.MessageCreate> {
	public override async run(message: Message) {
		try {
			this.container.logger.debug('messageCreate received', {
				messageId: message.id,
				guildId: message.guildId,
				channelId: message.channel?.id,
				userId: message.author.id,
				isBot: message.author.bot
			});

			// Handle legacy bot message cleanup
			if (message.author.bot) {
				await this.handleLegacyBotMessages(message);
				return;
			}

			// Require guild context for remaining handlers
			if (!message.guildId || !message.channel) return;

			// Handle automatic slowmode
			try {
				await this.container.slowmodeManager.handleMessage(message);
			} catch (error) {
				this.container.logger.error('Automatic slowmode handler failed', error, {
					guildId: message.guildId,
					channelId: message.channel.id
				});
			}

			// Handle support thread activity monitoring
			try {
				await this.container.supportThreadMonitor.handleMessage(message);
			} catch (error) {
				this.container.logger.error('Support thread monitor failed', error, {
					guildId: message.guildId,
					channelId: message.channel.id
				});
			}
		} catch (error) {
			this.container.logger.error('Unhandled error in messageCreate listener', error, {
				guildId: message.guildId,
				channelId: message.channel?.id
			});
		}
	}

	// ============================================================
	// Legacy Bot Message Cleanup
	// ============================================================

	/**
	 * Handles cleanup of legacy bot messages
	 * - Deletes Wobin help/error messages
	 * - Deletes Lawren command info for non-staff users
	 */
	private async handleLegacyBotMessages(message: Message) {
		// Only process Wobin and Lawren bots
		if (message.author.id !== WOBIN_BOT_ID && message.author.id !== LAWREN_BOT_ID) {
			return;
		}

		this.container.logger.debug('Handling legacy bot message', {
			messageId: message.id,
			channelId: message.channel.id,
			guildId: message.guildId,
			botId: message.author.id
		});

		// Handle Wobin legacy help messages
		if (message.author.id === WOBIN_BOT_ID) {
			await this.handleWobinMessages(message);
		}

		// Handle Lawren command info messages
		if (message.author.id === LAWREN_BOT_ID) {
			await this.handleLawrenMessages(message);
		}
	}

	/**
	 * Deletes Wobin's legacy help and error messages
	 */
	private async handleWobinMessages(message: Message) {
		const shouldDelete =
			message.content.includes('No Category:') ||
			message.content.includes('!gettheclankersoutofthisfuckingserver') ||
			message.content.includes('No command called');

		if (shouldDelete) {
			try {
				await message.delete();
				this.container.logger.info('Deleted legacy help message from Wobin', {
					messageId: message.id,
					channelId: message.channel.id,
					guildId: message.guildId
				});
			} catch (error) {
				this.container.logger.error('Failed to delete legacy help message from Wobin', error, {
					messageId: message.id,
					channelId: message.channel.id,
					guildId: message.guildId
				});
			}
		}
	}

	/**
	 * Deletes Lawren's command info messages for non-staff users
	 */
	private async handleLawrenMessages(message: Message) {
		if (message.embeds.length === 0) return;

		const embed = message.embeds[0];
		if (embed.title !== 'Command Information' || !message.reference?.messageId) {
			return;
		}

		try {
			// Fetch the message that triggered the command info
			const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
			if (!referencedMessage) return;

			// Check if user has staff permissions
			const hasStaffPerms = await this.checkStaffPermissions(referencedMessage.guildId, referencedMessage.member);

			// Delete command info if user is not staff
			if (!hasStaffPerms) {
				await message.delete();
				this.container.logger.info('Deleted Lawren command info message for non-staff user', {
					messageId: message.id,
					referencedMessageId: referencedMessage.id,
					channelId: message.channel.id,
					guildId: message.guildId
				});
			}
		} catch (error) {
			this.container.logger.error('Failed to process Lawren command info message', error, {
				messageId: message.id,
				channelId: message.channel.id,
				guildId: message.guildId
			});
		}
	}

	// ============================================================
	// Permission Checks
	// ============================================================

	/**
	 * Checks if a member has staff role permissions
	 * @returns True if member has any configured staff role
	 */
	private async checkStaffPermissions(guildId: string | null, member: GuildMember | null): Promise<boolean> {
		if (!guildId || !member) {
			return false;
		}

		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[messageCreate] Role settings service is unavailable');
			return false;
		}

		try {
			// Fetch configured staff roles
			const allowedRoles = await service.listBucket(guildId, 'allowedStaffRoles');
			if (allowedRoles.length === 0) {
				return false;
			}

			// Check if member has any staff role
			return allowedRoles.some((roleId) => member.roles.cache.has(roleId));
		} catch (error) {
			this.container.logger.error('[messageCreate] Failed to check staff permissions', error);
			return false;
		}
	}
}
