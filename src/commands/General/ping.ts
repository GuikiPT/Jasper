import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ContainerBuilder, ActionRowBuilder, MessageActionRowComponentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'ping',
	description: 'Check the current websocket heartbeat and interaction round-trip time.',
	detailedDescription: 'Measures the bot\'s websocket latency and the Discord API latency for the current interaction.',
	aliases: ['latency'],
	fullCategory: ['General'],
	cooldownLimit: 1,
	cooldownDelay: 10_000,
	cooldownScope: BucketScope.User,
	requiredClientPermissions: ['SendMessages'],
	runIn: [CommandOptionsRunTypeEnum.Dm, CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [
		ApplicationIntegrationType.GuildInstall,
		ApplicationIntegrationType.UserInstall
	];
	private readonly contexts: InteractionContextType[] = [
		InteractionContextType.BotDM,
		InteractionContextType.Guild,
		InteractionContextType.PrivateChannel
	];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: this.integrationTypes,
			contexts: this.contexts
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const latency = Date.now() - interaction.createdTimestamp;

		const components = [
			new ContainerBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`### Discord API Latency\n\`\`\`\n[ ${Math.round(this.container.client.ws.ping)}ms ]\n\`\`\`\n### Bot Latency\n\`\`\`\n[ ${latency}ms ]\n\`\`\``),
				)
				.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
				)
				.addActionRowComponents(
					new ActionRowBuilder<MessageActionRowComponentBuilder>()
						.addComponents(
							new ButtonBuilder()
								.setStyle(ButtonStyle.Link)
								.setLabel("Discord Status Page")
								.setURL("https://discordstatus.com/"),
						),
				),
		];

		return interaction.editReply({ components, flags: [MessageFlags.IsComponentsV2] });
	}
}
