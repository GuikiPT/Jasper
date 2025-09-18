import { AllFlowsPrecondition } from '@sapphire/framework';
import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
	GuildMember,
	Message
} from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

const ERROR_MESSAGE = 'You need an allowed fun command role to use this command.';

export class AllowedFunCommandRolesPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return this.checkMemberAccess(message.guildId, message.member);
	}

	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkMemberAccess(interaction.guildId, interaction.member ?? null);
	}

	private async checkMemberAccess(
		guildId: string | null,
		member: GuildMember | APIInteractionGuildMember | null
	) {
		if (!guildId || !member) {
			return this.error({ message: ERROR_MESSAGE });
		}

		const allowedRoles = await this.fetchAllowedRoles(guildId);

		if (allowedRoles.length === 0) {
			return this.error({ message: ERROR_MESSAGE });
		}

		if (this.memberHasAllowedRole(member, allowedRoles)) {
			return this.ok();
		}

		return this.error({ message: ERROR_MESSAGE });
	}

	private async fetchAllowedRoles(guildId: string) {
		const settings = await this.container.database.guildRoleSettings.findUnique({
			where: { guildId }
		});

		const value = settings?.allowedFunCommandRoles as unknown;
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
		AllowedFunCommandRoles: never;
	}
}
