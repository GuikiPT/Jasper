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
} from '../../commands-sub/settings/prefix';
import {
	roleSubcommandMapping,
	registerRoleSubcommandGroup,
	chatInputRoleAdd as handleChatInputRoleAdd,
	chatInputRoleList as handleChatInputRoleList,
	chatInputRoleRemove as handleChatInputRoleRemove,
	messageRoleAdd as handleMessageRoleAdd,
	messageRoleList as handleMessageRoleList,
	messageRoleRemove as handleMessageRoleRemove
} from '../../commands-sub/settings/roles';

@ApplyOptions<Subcommand.Options>({
	name: 'settings',
	description: 'Configure server-specific settings.',
	fullCategory: ['Settings'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	subcommands: [prefixSubcommandMapping, roleSubcommandMapping]
})
export class SettingsCommand extends Subcommand {
	private readonly integrationTypes: ApplicationIntegrationType[] = [
		ApplicationIntegrationType.GuildInstall
	];

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
}
