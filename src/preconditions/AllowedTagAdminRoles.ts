import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

const ERROR_MESSAGE = 'You need an allowed tag admin role to use this command.';

export class AllowedTagAdminRolesPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return this.checkMemberAccess(message.guildId, message.member, true);
	}

	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null, false);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null, false);
	}

	private async checkMemberAccess(
		guildId: string | null,
		member: GuildMember | APIInteractionGuildMember | null,
		silentOnFail: boolean
	) {
		if (!guildId || !member) {
			this.logDenial('missing-member', { guildId, member, silent: silentOnFail });
			return this.error({ message: ERROR_MESSAGE, context: silentOnFail ? { silent: true } : {} });
		}

		const allowedRoles = await this.fetchAllowedRoles(guildId);

		if (allowedRoles.length === 0) {
			this.logDenial('no-config', { guildId, member, allowedRoles, silent: silentOnFail });
			return this.error({ message: ERROR_MESSAGE, context: silentOnFail ? { silent: true } : {} });
		}

		if (this.memberHasAllowedRole(member, allowedRoles)) {
			this.logSuccess({ guildId, member, allowedRoles, silent: silentOnFail });
			return this.ok();
		}

		this.logDenial('forbidden', { guildId, member, allowedRoles, silent: silentOnFail });
		return this.error({ message: ERROR_MESSAGE, context: silentOnFail ? { silent: true } : {} });
	}

	private async fetchAllowedRoles(guildId: string) {
		const settings = await this.container.database.guildRoleSettings.findUnique({
			where: { guildId }
		});

		const value = settings?.allowedTagAdminRoles as unknown;
		return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
	}

	private memberHasAllowedRole(member: GuildMember | APIInteractionGuildMember, allowedRoles: readonly string[]) {
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

	private logSuccess(details: AdminLogDetails) {
		const logger = this.container.logger;
		if (!logger) return;
		logger.debug('[AllowedTagAdminRoles] Access granted', this.buildMeta(details));
	}

	private logDenial(
		reason: 'missing-member' | 'no-config' | 'forbidden',
		details: AdminLogDetails
	) {
		const logger = this.container.logger;
		if (!logger) return;
		const meta = { ...this.buildMeta(details), reason };
		const level = details.silent
			? 'debug'
			: reason === 'forbidden'
				? 'warn'
				: 'info';
		logger[level]('[AllowedTagAdminRoles] Access denied', meta);
	}

	private buildMeta({ guildId, member, allowedRoles, silent }: AdminLogDetails) {
		return {
			guildId: guildId ?? 'unknown',
			memberId: this.resolveMemberId(member),
			memberRoleIds: this.collectMemberRoles(member),
			allowedRoles: allowedRoles ?? [],
			silent: silent ?? false
		};
	}

	private resolveMemberId(member: GuildMember | APIInteractionGuildMember | null) {
		if (!member) return 'unknown';
		if ('user' in member && member.user) {
			return member.user.id;
		}
		return (member as GuildMember)?.id ?? 'unknown';
	}

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

type AdminLogDetails = {
	guildId: string | null;
	member: GuildMember | APIInteractionGuildMember | null;
	allowedRoles?: string[];
	silent?: boolean;
};

declare module '@sapphire/framework' {
	interface Preconditions {
		AllowedTagAdminRoles: never;
	}
}
