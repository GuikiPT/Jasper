import { ApplyOptions } from '@sapphire/decorators';
import { Args, BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import type { Message } from 'discord.js';
import {
	prefixSubcommandMapping,
	registerPrefixSubcommandGroup,
	chatInputPrefixSet as handleChatInputPrefixSet,
	chatInputPrefixView as handleChatInputPrefixView,
	messagePrefixSet as handleMessagePrefixSet,
	messagePrefixView as handleMessagePrefixView
} from '../../subcommands/settings/prefix';
import {
	roleSubcommandMapping,
	registerRoleSubcommandGroup,
	chatInputRoleAdd as handleChatInputRoleAdd,
	chatInputRoleList as handleChatInputRoleList,
	chatInputRoleRemove as handleChatInputRoleRemove,
	messageRoleAdd as handleMessageRoleAdd,
	messageRoleList as handleMessageRoleList,
	messageRoleRemove as handleMessageRoleRemove
} from '../../subcommands/settings/roles';
import {
	channelSubcommandMapping,
	registerChannelSubcommandGroup,
	chatInputChannelAdd as handleChatInputChannelAdd,
	chatInputChannelList as handleChatInputChannelList,
	chatInputChannelRemove as handleChatInputChannelRemove,
	messageChannelAdd as handleMessageChannelAdd,
	messageChannelList as handleMessageChannelList,
	messageChannelRemove as handleMessageChannelRemove
} from '../../subcommands/settings/channels';
import {
	topicSubcommandMapping,
	registerTopicSubcommandGroup,
	chatInputTopicAdd as handleChatInputTopicAdd,
	chatInputTopicList as handleChatInputTopicList,
	chatInputTopicRemove as handleChatInputTopicRemove,
	chatInputTopicImport as handleChatInputTopicImport,
	chatInputTopicExport as handleChatInputTopicExport,
	messageTopicAdd as handleMessageTopicAdd,
	messageTopicList as handleMessageTopicList,
	messageTopicRemove as handleMessageTopicRemove,
	messageTopicImport as handleMessageTopicImport,
	messageTopicExport as handleMessageTopicExport
} from '../../subcommands/settings/topics';
import {
	supportSubcommandMapping,
	registerSupportSubcommandGroup,
	chatInputSupportSet as handleChatInputSupportSet,
	chatInputSupportView as handleChatInputSupportView,
	messageSupportSet as handleMessageSupportSet,
	messageSupportView as handleMessageSupportView
} from '../../subcommands/settings/support';

@ApplyOptions<Subcommand.Options>({
	name: 'settings',
	description: 'Configure server-specific settings.',
	fullCategory: ['Settings'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	requiredClientPermissions: ['SendMessages'],
	subcommands: [prefixSubcommandMapping, roleSubcommandMapping, channelSubcommandMapping, topicSubcommandMapping, supportSubcommandMapping]
})
export class SettingsCommand extends Subcommand {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];

	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addSubcommandGroup(registerPrefixSubcommandGroup)
				.addSubcommandGroup(registerRoleSubcommandGroup)
				.addSubcommandGroup(registerChannelSubcommandGroup)
				.addSubcommandGroup(registerTopicSubcommandGroup)
				.addSubcommandGroup(registerSupportSubcommandGroup)
		);
	}

	public async messagePrefixSet(message: Message, args: Args) {
		return handleMessagePrefixSet(this, message, args);
	}

	public async messagePrefixView(message: Message, args: Args) {
		return handleMessagePrefixView(this, message, args);
	}

	public async chatInputPrefixSet(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputPrefixSet(this, interaction);
	}

	public async chatInputPrefixView(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputPrefixView(this, interaction);
	}

	public async messageRoleAdd(message: Message, args: Args) {
		return handleMessageRoleAdd(this, message, args);
	}

	public async messageRoleRemove(message: Message, args: Args) {
		return handleMessageRoleRemove(this, message, args);
	}

	public async messageRoleList(message: Message, args: Args) {
		return handleMessageRoleList(this, message, args);
	}

	public async chatInputRoleAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputRoleAdd(this, interaction);
	}

	public async chatInputRoleRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputRoleRemove(this, interaction);
	}

	public async chatInputRoleList(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputRoleList(this, interaction);
	}

	public async messageChannelAdd(message: Message, args: Args) {
		return handleMessageChannelAdd(this, message, args);
	}

	public async messageChannelRemove(message: Message, args: Args) {
		return handleMessageChannelRemove(this, message, args);
	}

	public async messageChannelList(message: Message, args: Args) {
		return handleMessageChannelList(this, message, args);
	}

	public async chatInputChannelAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputChannelAdd(this, interaction);
	}

	public async chatInputChannelRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputChannelRemove(this, interaction);
	}

	public async chatInputChannelList(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputChannelList(this, interaction);
	}

	public async messageTopicAdd(message: Message, args: Args) {
		return handleMessageTopicAdd(this, message, args);
	}

	public async messageTopicRemove(message: Message, args: Args) {
		return handleMessageTopicRemove(this, message, args);
	}

	public async messageTopicList(message: Message, args: Args) {
		return handleMessageTopicList(this, message, args);
	}

	public async chatInputTopicAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicAdd(this, interaction);
	}

	public async chatInputTopicRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicRemove(this, interaction);
	}

	public async chatInputTopicList(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicList(this, interaction);
	}

	public async messageTopicImport(message: Message, args: Args) {
		return handleMessageTopicImport(this, message, args);
	}

	public async messageTopicExport(message: Message, args: Args) {
		return handleMessageTopicExport(this, message, args);
	}

	public async chatInputTopicImport(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicImport(this, interaction);
	}

	public async chatInputTopicExport(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputTopicExport(this, interaction);
	}

	public async messageSupportSet(message: Message, args: Args) {
		return handleMessageSupportSet(this, message, args);
	}

	public async messageSupportView(message: Message, args: Args) {
		return handleMessageSupportView(this, message, args);
	}

	public async chatInputSupportSet(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputSupportSet(this, interaction);
	}

	public async chatInputSupportView(interaction: Subcommand.ChatInputCommandInteraction) {
		return handleChatInputSupportView(this, interaction);
	}
}
