import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

const ERROR_MESSAGE = 'You need a role listed under ignored sniped roles to use this command.';

export class IgnoredSnipedRolesPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return this.checkMemberAccess(message.guildId, message.member, true);
	}

	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null, false);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null, false);
	}

	private async checkMemberAccess(guildId: string | null, member: GuildMember | APIInteractionGuildMember | null, silentOnFail: boolean) {
		if (!guildId || !member) {
			return this.error({ message: ERROR_MESSAGE, context: silentOnFail ? { silent: true } : undefined });
		}

		const allowedRoles = await this.fetchRoles(guildId);

		if (allowedRoles.length === 0) {
			return this.error({ message: ERROR_MESSAGE, context: silentOnFail ? { silent: true } : undefined });
		}

		if (this.memberHasAllowedRole(member, allowedRoles)) {
			return this.ok();
		}

		return this.error({ message: ERROR_MESSAGE, context: silentOnFail ? { silent: true } : undefined });
	}

	private async fetchRoles(guildId: string) {
		const settings = await this.container.database.guildRoleSettings.findUnique({
			where: { guildId }
		});

		const value = settings?.ignoredSnipedRoles as unknown;
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
}

declare module '@sapphire/framework' {
	interface Preconditions {
		IgnoredSnipedRoles: never;
	}
}
