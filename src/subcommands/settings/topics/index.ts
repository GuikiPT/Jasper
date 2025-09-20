import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { registerTopicSubcommandGroup } from './utils';
import { messageTopicAdd, chatInputTopicAdd } from './topics-add';
import { messageTopicList, chatInputTopicList } from './topics-list';
import { messageTopicRemove, chatInputTopicRemove } from './topics-remove';
import { messageTopicImport, chatInputTopicImport } from './topics-import';
import { messageTopicExport, chatInputTopicExport } from './topics-export';

export {
	registerTopicSubcommandGroup,
	messageTopicAdd,
	messageTopicList,
	messageTopicRemove,
	messageTopicImport,
	messageTopicExport,
	chatInputTopicAdd,
	chatInputTopicList,
	chatInputTopicRemove,
	chatInputTopicImport,
	chatInputTopicExport
};

export const topicSubcommandMapping: SubcommandMappingGroup = {
	name: 'topics',
	type: 'group',
	entries: [
		{
			name: 'add',
			chatInputRun: 'chatInputTopicAdd',
			messageRun: 'messageTopicAdd',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'list',
			chatInputRun: 'chatInputTopicList',
			messageRun: 'messageTopicList',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'remove',
			chatInputRun: 'chatInputTopicRemove',
			messageRun: 'messageTopicRemove',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'import',
			chatInputRun: 'chatInputTopicImport',
			messageRun: 'messageTopicImport',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'export',
			chatInputRun: 'chatInputTopicExport',
			messageRun: 'messageTopicExport',
			preconditions: ['AllowedAdminRoles']
		}
	]
};
