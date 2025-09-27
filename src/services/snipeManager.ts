import type { PrismaClient } from '@prisma/client';
import type { SapphireClient } from '@sapphire/framework';
import type { Message, PartialMessage, GuildMember, APIInteractionGuildMember } from 'discord.js';

interface SnipedMessage {
	id: string;
	content: string;
	author: {
		id: string;
		username: string;
		discriminator: string;
		displayName: string;
		avatarURL: string | null;
	};
	channel: {
		id: string;
		name: string;
	};
	guild: {
		id: string;
		name: string;
	};
	attachments: Array<{
		id: string;
		name: string;
		url: string;
		proxyURL: string;
		size: number;
	}>;
	embeds: Array<{
		title?: string;
		description?: string;
		url?: string;
	}>;
	deletedAt: Date;
	createdAt: Date;
}

interface GuildSnipeState {
	messages: Map<string, SnipedMessage>; // channelId -> message
}

export class SnipeManager {
	private readonly guildStates = new Map<string, GuildSnipeState>();
	private readonly ignoredDeletionIds = new Set<string>();
	private readonly MESSAGE_RETENTION_MS = 5 * 60 * 1000; // 5 minutes

	public constructor(private readonly client: SapphireClient, private readonly database: PrismaClient) {
		// Clean up old messages every 30 seconds
		setInterval(() => this.cleanupOldMessages(), 30_000);
	}

	/**
	 * Handles message deletion events
	 */
	public async handleMessageDelete(message: Message | PartialMessage) {
		// Skip if message is not in a guild
		if (!message.guildId || !message.guild) return;

		// If this specific message ID is marked to be ignored (e.g. bot deleted the command message), skip and remove marker
		if (message.id && this.ignoredDeletionIds.has(message.id)) {
			this.ignoredDeletionIds.delete(message.id);
			this.client.logger.debug('[Snipe] Ignored deletion for message id', { messageId: message.id });
			return;
		}

		// Skip messages that look like bot commands (common prefix used on this server)
		const content = message.content ? String(message.content).trim() : '';
		if (content && content.startsWith('j!')) {
			this.client.logger.debug('[Snipe] Ignored deletion for command-like message', { guildId: message.guildId, channelId: message.channelId });
			return;
		}

		// Skip bot messages
		if (message.author?.bot) return;

		// Skip if message content is empty and has no attachments/embeds
		if (!message.content && (!message.attachments?.size) && (!message.embeds?.length)) return;

		// Check if channel is in allowed snipe channels
		const isChannelAllowed = await this.isChannelAllowed(message.guildId, message.channelId);
		if (!isChannelAllowed) {
			this.client.logger.debug('[Snipe] Message deleted in non-allowed channel', {
				guildId: message.guildId,
				channelId: message.channelId
			});
			return;
		}

		// ...existing code...

		// Check if author has ignored snipe roles
		if (message.member) {
			const hasIgnoredRole = await this.hasIgnoredSnipeRoles(message.guildId, message.member);
			if (hasIgnoredRole) {
				this.client.logger.debug('[Snipe] Message author has ignored snipe role', {
					guildId: message.guildId,
					authorId: message.author?.id,
					channelId: message.channelId
				});
				return;
			}
		}

		// Get or create guild state
		const guildState = this.getGuildState(message.guildId);

		// Store the message
		if (message.author && message.channel && message.guild) {
			const snipedMessage: SnipedMessage = {
				id: message.id,
				content: message.content || '',
				author: {
					id: message.author.id,
					username: message.author.username,
					discriminator: message.author.discriminator,
					displayName: message.member?.displayName || message.author.displayName || message.author.username,
					avatarURL: message.author.displayAvatarURL()
				},
				channel: {
					id: message.channel.id,
					name: 'name' in message.channel ? message.channel.name || `Channel ${message.channel.id}` : `Channel ${message.channel.id}`
				},
				guild: {
					id: message.guild.id,
					name: message.guild.name
				},
				attachments: message.attachments?.map(att => ({
					id: att.id,
					name: att.name,
					url: att.url,
					proxyURL: att.proxyURL,
					size: att.size
				})) || [],
				embeds: message.embeds?.map(embed => ({
					title: embed.title || undefined,
					description: embed.description || undefined,
					url: embed.url || undefined
				})) || [],
				deletedAt: new Date(),
				createdAt: message.createdAt || new Date()
			};

			guildState.messages.set(message.channelId, snipedMessage);

			this.client.logger.debug('[Snipe] Message stored for sniping', {
				guildId: message.guildId,
				channelId: message.channelId,
				messageId: message.id,
				authorId: message.author.id
			});
		}
	}

	/**
	 * Retrieves the last deleted message for a channel
	 */
	public getLastDeletedMessage(guildId: string, channelId: string): SnipedMessage | null {
		const guildState = this.guildStates.get(guildId);
		if (!guildState) return null;

		const message = guildState.messages.get(channelId);
		if (!message) return null;

		// Check if message is still within retention period
		const now = new Date();
		const timeSinceDeleted = now.getTime() - message.deletedAt.getTime();

		if (timeSinceDeleted > this.MESSAGE_RETENTION_MS) {
			// Remove expired message
			guildState.messages.delete(channelId);
			return null;
		}

		return message;
	}

	/**
	 * Checks if a user can use snipe command (has staff or admin roles)
	 */
	public async canUseSnipe(guildId: string, member: GuildMember | APIInteractionGuildMember): Promise<boolean> {
		try {
			const settings = await this.database.guildRoleSettings.findUnique({
				where: { guildId }
			});

			if (!settings) return false;

			// Check for staff roles
			const staffRoles = this.parseStringArray(settings.allowedStaffRoles);
			const adminRoles = this.parseStringArray(settings.allowedAdminRoles);
			const allowedRoles = [...staffRoles, ...adminRoles];

			if (allowedRoles.length === 0) return false;

			return this.memberHasAllowedRole(member, allowedRoles);
		} catch (error) {
			this.client.logger.error('[Snipe] Failed to check snipe permissions', error, { guildId });
			return false;
		}
	}

	private async isChannelAllowed(guildId: string, channelId: string): Promise<boolean> {
		try {
			const settings = await this.database.guildChannelSettings.findUnique({
				where: { guildId }
			});

			if (!settings) return false;

			const allowedChannels = this.parseStringArray(settings.allowedSnipeChannels);
			return allowedChannels.includes(channelId);
		} catch (error) {
			this.client.logger.error('[Snipe] Failed to check allowed channels', error, { guildId });
			return false;
		}
	}

	private async hasIgnoredSnipeRoles(guildId: string, member: GuildMember): Promise<boolean> {
		try {
			const settings = await this.database.guildRoleSettings.findUnique({
				where: { guildId }
			});

			if (!settings) return false;

			const ignoredRoles = this.parseStringArray(settings.ignoredSnipedRoles);
			return this.memberHasAllowedRole(member, ignoredRoles);
		} catch (error) {
			this.client.logger.error('[Snipe] Failed to check ignored roles', error, { guildId });
			return false;
		}
	}

	private getGuildState(guildId: string): GuildSnipeState {
		let state = this.guildStates.get(guildId);
		if (!state) {
			state = {
				messages: new Map()
			};
			this.guildStates.set(guildId, state);
		}
		return state;
	}

	private parseStringArray(value: string | null | undefined): string[] {
		if (!value) return [];
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
		} catch {
			return [];
		}
	}

	private memberHasAllowedRole(member: GuildMember | APIInteractionGuildMember, allowedRoles: string[]): boolean {
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

	private cleanupOldMessages(): void {
		const now = new Date();
		let cleanupCount = 0;

		for (const [guildId, guildState] of this.guildStates.entries()) {
			const toDelete: string[] = [];

			for (const [channelId, message] of guildState.messages.entries()) {
				const timeSinceDeleted = now.getTime() - message.deletedAt.getTime();
				if (timeSinceDeleted > this.MESSAGE_RETENTION_MS) {
					toDelete.push(channelId);
					cleanupCount++;
				}
			}

			// Remove expired messages
			for (const channelId of toDelete) {
				guildState.messages.delete(channelId);
			}

			// Remove empty guild states
			if (guildState.messages.size === 0) {
				this.guildStates.delete(guildId);
			}
		}

		if (cleanupCount > 0) {
			this.client.logger.debug(`[Snipe] Cleaned up ${cleanupCount} expired messages`);
		}
	}

	/**
	 * Mark a message id so that when it's deleted the snipe manager will ignore that deletion.
	 * The marker expires automatically after a short timeout.
	 */
	public ignoreMessageDeletion(messageId: string, ttl = 60_000) {
		if (!messageId) return;
		this.ignoredDeletionIds.add(messageId);
		setTimeout(() => this.ignoredDeletionIds.delete(messageId), ttl);
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		snipeManager: SnipeManager;
	}
}