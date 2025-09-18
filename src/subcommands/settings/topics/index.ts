import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { registerTopicSubcommandGroup } from './utils';
import { messageTopicAdd, chatInputTopicAdd } from './add';
import { messageTopicList, chatInputTopicList } from './list';
import { messageTopicRemove, chatInputTopicRemove } from './remove';
import { messageTopicImport, chatInputTopicImport } from './import';
import { messageTopicExport, chatInputTopicExport } from './export';

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
	name: 'topic',
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
