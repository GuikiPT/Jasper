// messageCreate module within listeners
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Message, GuildMember } from 'discord.js';

// Hooks into Discord message creation to support legacy command handling.

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class AutomaticSlowmodeListener extends Listener<typeof Events.MessageCreate> {
	public override async run(message: Message) {
		if (message.author.bot) {
			const wobinId = '1223012641543426088';
			const lawrenId = '1306785011256659968';

			if (message.author.id !== wobinId && message.author.id !== lawrenId) return;

			if (
				message.author.id === wobinId &&
				(message.content.includes('No Category:') ||
					message.content.includes('!gettheclankersoutofthisfuckingserver') ||
					message.content.includes('No command called'))
			) {
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

			if (message.author.id === lawrenId && message.embeds.length > 0) {
				const embed = message.embeds[0];
				if (embed.title === 'Command Information' && message.reference?.messageId) {
					try {
						const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
						if (referencedMessage) {
							const hasStaffPerms = await this.checkStaffPermissions(referencedMessage.guildId, referencedMessage.member);
							if (!hasStaffPerms) {
								await message.delete();
								this.container.logger.info('Deleted Lawren command info message for non-staff user', {
									messageId: message.id,
									referencedMessageId: referencedMessage.id,
									channelId: message.channel.id,
									guildId: message.guildId
								});
							}
						}
					} catch (error) {
						this.container.logger.error('Failed to process Lawren command info message', error, {
							messageId: message.id,
							channelId: message.channel.id,
							guildId: message.guildId
						});
					}
				}
			}
		}

		if (!message.guildId) return;
		if (!message.channel) return;

		try {
			await this.container.slowmodeManager.handleMessage(message);
		} catch (error) {
			this.container.logger.error('Automatic slowmode handler failed', error, {
				guildId: message.guildId,
				channelId: message.channel.id
			});
		}

		try {
			await this.container.supportThreadMonitor.handleMessage(message);
		} catch (error) {
			this.container.logger.error('Support thread monitor failed', error, {
				guildId: message.guildId,
				channelId: message.channel.id
			});
		}
	}

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
			const allowedRoles = await service.listBucket(guildId, 'allowedStaffRoles');
			if (allowedRoles.length === 0) {
				return false;
			}

			return allowedRoles.some((roleId) => member.roles.cache.has(roleId));
		} catch (error) {
			this.container.logger.error('[messageCreate] Failed to check staff permissions', error);
			return false;
		}
	}
}
