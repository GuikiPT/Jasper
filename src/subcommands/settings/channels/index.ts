import type { SubcommandMappingGroup } from '@sapphire/plugin-subcommands';

import { CHANNEL_BUCKETS, registerChannelSubcommandGroup } from './utils';
import { chatInputChannelAdd, messageChannelAdd } from './add';
import { chatInputChannelRemove, messageChannelRemove } from './remove';
import { chatInputChannelList, messageChannelList } from './list';

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

export const channelSubcommandMapping: SubcommandMappingGroup = {
  name: 'channel',
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

