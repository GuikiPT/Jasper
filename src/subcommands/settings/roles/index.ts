import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { ROLE_BUCKETS, registerRoleSubcommandGroup } from './utils';
import { chatInputRoleAdd, messageRoleAdd } from './add';
import { chatInputRoleList, messageRoleList } from './list';
import { chatInputRoleRemove, messageRoleRemove } from './remove';

export {
	ROLE_BUCKETS,
	registerRoleSubcommandGroup,
	chatInputRoleAdd,
	chatInputRoleList,
	chatInputRoleRemove,
	messageRoleAdd,
	messageRoleList,
	messageRoleRemove
};

export const roleSubcommandMapping: SubcommandMappingGroup = {
	name: 'role',
	type: 'group',
	entries: [
		{
			name: 'add',
			chatInputRun: 'chatInputRoleAdd',
			messageRun: 'messageRoleAdd',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedAdminRoles', 'allowedTagAdminRoles'] as const,
						allowManageGuild: true,
						errorMessage:
							'You need an allowed admin role, allowed tag admin role, or the Manage Server permission to modify role settings.'
					}
				}
			]
		},
		{
			name: 'remove',
			chatInputRun: 'chatInputRoleRemove',
			messageRun: 'messageRoleRemove',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedAdminRoles', 'allowedTagAdminRoles'] as const,
						allowManageGuild: true,
						errorMessage:
							'You need an allowed admin role, allowed tag admin role, or the Manage Server permission to modify role settings.'
					}
				}
			]
		},
		{
			name: 'list',
			chatInputRun: 'chatInputRoleList',
			messageRun: 'messageRoleList',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedAdminRoles', 'allowedTagAdminRoles'] as const,
						allowManageGuild: true,
						errorMessage:
							'You need an allowed admin role, allowed tag admin role, or the Manage Server permission to view role settings.'
					}
				}
			]
		}
	]
};
