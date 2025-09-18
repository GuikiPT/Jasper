import { ApplyOptions } from '@sapphire/decorators';
import { Args, BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import type { Message } from 'discord.js';
import {
	prefixSubcommandMapping,
	registerPrefixSubcommand,
	runPrefixChatInput,
	runPrefixMessage
} from '../../lib/subcommands/settings/prefix';

@ApplyOptions<Subcommand.Options>({
	name: 'settings',
	description: 'Configure server-specific settings.',
	fullCategory: ['Settings'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	subcommands: [prefixSubcommandMapping]
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
				.addSubcommand(registerPrefixSubcommand)
		);
	}

	public async messagePrefix(message: Message, args: Args) {
		return runPrefixMessage(this, message, args);
	}

	public async chatInputPrefix(interaction: Subcommand.ChatInputCommandInteraction) {
		return runPrefixChatInput(this, interaction);
	}
}
