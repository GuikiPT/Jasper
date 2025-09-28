import { AllFlowsPrecondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { APIInteractionGuildMember } from 'discord.js';

export class AllowedAdminRolesPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return this.checkMemberAccess(
			message.guildId,
			message.member,
			message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false,
			true
		);
	}

	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false,
			false
		);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkMemberAccess(
			interaction.guildId,
			interaction.member ?? null,
			interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false,
			false
		);
	}

	private async checkMemberAccess(
		guildId: string | null,
		member: GuildMember | APIInteractionGuildMember | null,
		hasAdministrator: boolean,
		silentOnFail: boolean
	) {
		if (!guildId || !member) {
			return this.error({
				message: this.createErrorMessage([]),
				context: silentOnFail ? { silent: true } : {}
			});
		}

		if (hasAdministrator) {
			return this.ok();
		}

		const allowedRoles = await this.fetchAllowedAdminRoles(guildId);

		if (allowedRoles.length === 0) {
			return this.error({
				message: this.createErrorMessage([]),
				context: silentOnFail ? { silent: true } : {}
			});
		}

		if (this.memberHasAllowedRole(member, allowedRoles)) {
			return this.ok();
		}

		return this.error({
			message: this.createErrorMessage(allowedRoles),
			context: silentOnFail ? { silent: true } : {}
		});
	}

	private createErrorMessage(allowedRoles: string[]): string {
		const permissions: string[] = [];

		// Always mention "Administrator" permission as a valid option
		permissions.push('users with "Administrator" permission');

		if (allowedRoles.length > 0) {
			permissions.push('users with "Allowed Admin Roles"');
		}

		if (permissions.length === 1 && allowedRoles.length === 0) {
			return 'Admin commands may only be used by users with "Administrator" permission. No admin roles are currently configured.';
		}

		return `Admin commands may only be used by ${permissions.join(' or ')}.`;
	}

	private async fetchAllowedAdminRoles(guildId: string) {
		const service = this.container.guildRoleSettingsService;
		if (!service) {
			this.container.logger.error('[AllowedAdminRoles] Role settings service is unavailable');
			return [];
		}

		try {
			return await service.listBucket(guildId, 'allowedAdminRoles');
		} catch (error) {
			this.container.logger.error('[AllowedAdminRoles] Failed to load guild role settings', error);
			return [];
		}
	}

	private memberHasAllowedRole(member: GuildMember | APIInteractionGuildMember, allowedRoles: readonly string[]) {
		if ('roles' in member) {
			const roles = (member as APIInteractionGuildMember).roles;
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
		AllowedAdminRoles: never;
	}
}
