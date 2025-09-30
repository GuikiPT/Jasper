// index module within subcommands/settings/youtube
import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { registerYouTubeSubcommandGroup } from './utils';
import { messageYouTubeEnable, chatInputYouTubeEnable } from './youtube-enable';
import { messageYouTubeDisable, chatInputYouTubeDisable } from './youtube-disable';
import { messageYouTubeView, chatInputYouTubeView } from './youtube-view';
import { messageYouTubeTest, chatInputYouTubeTest } from './youtube-test';
import { messageYouTubeForceUpdate, chatInputYouTubeForceUpdate } from './youtube-force-update';

export {
	registerYouTubeSubcommandGroup,
	messageYouTubeEnable,
	messageYouTubeDisable,
	messageYouTubeView,
	messageYouTubeTest,
	messageYouTubeForceUpdate,
	chatInputYouTubeEnable,
	chatInputYouTubeDisable,
	chatInputYouTubeView,
	chatInputYouTubeTest,
	chatInputYouTubeForceUpdate
};

export const youtubeSubcommandMapping: SubcommandMappingGroup = {
	name: 'youtube',
	type: 'group',
	entries: [
		{
			name: 'enable',
			chatInputRun: 'chatInputYouTubeEnable',
			messageRun: 'messageYouTubeEnable',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'disable',
			chatInputRun: 'chatInputYouTubeDisable',
			messageRun: 'messageYouTubeDisable',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'view',
			chatInputRun: 'chatInputYouTubeView',
			messageRun: 'messageYouTubeView',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'test',
			chatInputRun: 'chatInputYouTubeTest',
			messageRun: 'messageYouTubeTest',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'force-update',
			chatInputRun: 'chatInputYouTubeForceUpdate',
			messageRun: 'messageYouTubeForceUpdate',
			preconditions: ['AllowedAdminRoles']
		}
	]
};