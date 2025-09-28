// index module within subcommands/settings/support
import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { registerSupportSubcommandGroup } from './utils';
import { chatInputSupportSet, messageSupportSet } from './support-set';
import { chatInputSupportView, messageSupportView } from './support-view';

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
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedAdminRoles', 'allowedTagAdminRoles'] as const,
						allowManageGuild: true,
						errorMessage:
							'You need an allowed admin role, allowed tag admin role, or the Manage Server permission to change support settings.'
					}
				}
			]
		},
		{
			name: 'view',
			chatInputRun: 'chatInputSupportView',
			messageRun: 'messageSupportView',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedAdminRoles', 'allowedTagAdminRoles'] as const,
						allowManageGuild: true,
						errorMessage:
							'You need an allowed admin role, allowed tag admin role, or the Manage Server permission to view support settings.'
					}
				}
			]
		}
	]
};
