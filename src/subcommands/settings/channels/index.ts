// Channel settings subcommand group - exports and registration
import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { CHANNEL_BUCKETS, registerChannelSubcommandGroup } from './utils';
import { chatInputChannelAdd, messageChannelAdd } from './channels-add';
import { chatInputChannelRemove, messageChannelRemove } from './channels-remove';
import { chatInputChannelList, messageChannelList } from './channels-list';

// Re-export all channel subcommand components
export {
	CHANNEL_BUCKETS,
	registerChannelSubcommandGroup,
	chatInputChannelAdd,
	chatInputChannelRemove,
	chatInputChannelList,
	messageChannelAdd,
	messageChannelRemove,
	messageChannelList
};

// Subcommand mapping configuration for Sapphire framework
export const channelSubcommandMapping: SubcommandMappingGroup = {
	name: 'channels',
	type: 'group',
	entries: [
		{
			name: 'add',
			chatInputRun: 'chatInputChannelAdd',
			messageRun: 'messageChannelAdd',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'remove',
			chatInputRun: 'chatInputChannelRemove',
			messageRun: 'messageChannelRemove',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'list',
			chatInputRun: 'chatInputChannelList',
			messageRun: 'messageChannelList',
			preconditions: ['AllowedAdminRoles']
		}
	]
};
