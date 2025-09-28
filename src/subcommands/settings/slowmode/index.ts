// index module within subcommands/settings/slowmode
import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { chatInputSlowmodeConfigure, messageSlowmodeConfigure } from './slowmode-configure';
import { chatInputSlowmodeView, messageSlowmodeView } from './slowmode-view';
import {
	slowmodeSubcommandMapping,
	registerSlowmodeSubcommandGroup,
	parseMessageConfigureArgs,
	executeSlowmodeUpdate,
	executeSlowmodeView
} from './utils';

export {
	slowmodeSubcommandMapping,
	registerSlowmodeSubcommandGroup,
	chatInputSlowmodeView,
	messageSlowmodeView,
	chatInputSlowmodeConfigure,
	messageSlowmodeConfigure,
	executeSlowmodeUpdate,
	executeSlowmodeView,
	parseMessageConfigureArgs
};

export type SlowmodeSubcommandMapping = SubcommandMappingGroup;
