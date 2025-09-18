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
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'remove',
			chatInputRun: 'chatInputRoleRemove',
			messageRun: 'messageRoleRemove',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'list',
			chatInputRun: 'chatInputRoleList',
			messageRun: 'messageRoleList',
			preconditions: ['AllowedAdminRoles']
		}
	]
};
