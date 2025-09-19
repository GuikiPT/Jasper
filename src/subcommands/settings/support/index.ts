import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { registerSupportSubcommandGroup } from './utils';
import { chatInputSupportSet, messageSupportSet } from './set';
import { chatInputSupportView, messageSupportView } from './view';

export {
	registerSupportSubcommandGroup,
	chatInputSupportSet,
	chatInputSupportView,
	messageSupportSet,
	messageSupportView
};

export const supportSubcommandMapping: SubcommandMappingGroup = {
	name: 'support',
	type: 'group',
	entries: [
		{
			name: 'set',
			chatInputRun: 'chatInputSupportSet',
			messageRun: 'messageSupportSet',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'view',
			chatInputRun: 'chatInputSupportView',
			messageRun: 'messageSupportView',
			preconditions: ['AllowedAdminRoles']
		}
	]
};