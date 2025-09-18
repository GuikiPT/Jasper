import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommand, ContextMenuCommand, MessageCommand, Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';
import type { RoleBucketKey } from '../commands-sub/settings/roles/utils';

type AllowedGuildRoleBucketsContext = Precondition.Context & {
	buckets?: readonly RoleBucketKey[];
	allowManageGuild?: boolean;
	errorMessage?: string;
};

const DEFAULT_ERROR_MESSAGE = 'You need one of the allowed roles to use this command.';

export class AllowedGuildRoleBucketsPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message, _command: MessageCommand, context: AllowedGuildRoleBucketsContext) {
		return this.checkMemberAccess(
			message.guildId,
			message.member,
			message.member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			true
		);
	}

	public override chatInputRun(interaction: ChatInputCommandInteraction, _command: ChatInputCommand, context: AllowedGuildRoleBucketsContext) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			false
		);
	}

	public override contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		_command: ContextMenuCommand,
		context: AllowedGuildRoleBucketsContext
	) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
			context,
			false
		);
	}

	private async checkMemberAccess(
		guildId: string | null,
		member: GuildMember | APIInteractionGuildMember | null,
		hasManageGuild: boolean,
		context: AllowedGuildRoleBucketsContext,
		silentOnFail: boolean
	) {
		const { buckets, allowManageGuild, errorMessage } = this.resolveContext(context);

		if (!guildId || !member) {
			return this.error({ message: errorMessage, context: silentOnFail ? { silent: true } : undefined });
		}

		if (allowManageGuild && hasManageGuild) {
			return this.ok();
		}

		if (buckets.length === 0) {
			return this.error({ message: errorMessage, context: silentOnFail ? { silent: true } : undefined });
		}

		const allowedRoles = await this.fetchAllowedRoles(guildId, buckets);

		if (allowedRoles.length === 0) {
			return this.error({ message: errorMessage, context: silentOnFail ? { silent: true } : undefined });
		}

		if (this.memberHasAllowedRole(member, allowedRoles)) {
			return this.ok();
		}

		return this.error({ message: errorMessage, context: silentOnFail ? { silent: true } : undefined });
	}

	private resolveContext(context: AllowedGuildRoleBucketsContext) {
		return {
			buckets: Array.isArray(context.buckets) ? [...context.buckets] : [],
			allowManageGuild: context.allowManageGuild ?? false,
			errorMessage: context.errorMessage ?? DEFAULT_ERROR_MESSAGE
		};
	}

	private async fetchAllowedRoles(guildId: string, buckets: readonly RoleBucketKey[]) {
		const settings = await this.container.database.guildRoleSettings.findUnique({
			where: { guildId }
		});

		if (!settings) {
			return [] as string[];
		}

		const roles = new Set<string>();

		for (const bucket of buckets) {
			const value = settings[bucket] as unknown;
			if (Array.isArray(value)) {
				for (const entry of value) {
					if (typeof entry === 'string') {
						roles.add(entry);
					}
				}
			}
		}

		return [...roles];
	}

	private memberHasAllowedRole(member: GuildMember | APIInteractionGuildMember, allowedRoles: string[]) {
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
		AllowedGuildRoleBuckets: AllowedGuildRoleBucketsContext;
	}
}
