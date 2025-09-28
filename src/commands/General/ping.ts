// ping module within commands/General
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ContainerBuilder, ActionRowBuilder, MessageActionRowComponentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Provides the `/ping` diagnostic command for checking latency.
@ApplyOptions<Command.Options>({
	name: 'ping',
	description: 'Check the current websocket heartbeat and interaction round-trip time.',
	detailedDescription: {
		summary: 'Measures Jasper\'s websocket heartbeat alongside the time Discord took to respond to this interaction.',
		chatInputUsage: '/ping',
		messageUsage: '{{prefix}}ping',
		examples: ['/ping', '{{prefix}}ping'],
		notes: ['Latency values update every time you run the command.']
	},
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

	/** Responds with websocket and interaction latency measurements. */
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		try {
			await interaction.deferReply({ flags: ['Ephemeral'] });
		} catch (error) {
			this.container.logger.error('Failed to defer ping response', error, {
				guildId: interaction.guildId ?? 'dm'
			});
			if (!interaction.deferred && !interaction.replied) {
				return interaction.reply({
					content: 'I could not start the ping measurement because Discord rejected the response. Please try again.',
					flags: ['Ephemeral']
				});
			}
		}

		try {
			const latency = Date.now() - interaction.createdTimestamp;

			// Present websocket and API latency metrics alongside a link to Discord's status page
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
									.setLabel('Discord Status Page')
									.setURL('https://discordstatus.com/'),
							),
					),
			];

			return interaction.editReply({ components, flags: ['IsComponentsV2'] });
		} catch (error) {
			this.container.logger.error('Failed to send ping response', error, {
				guildId: interaction.guildId ?? 'dm'
			});
			return interaction.editReply({
				content: 'I hit an unexpected error while measuring latency. Please try again shortly.'
			});
		}
	}
}
