// ping module within commands/General
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ContainerBuilder,
	ActionRowBuilder,
	MessageActionRowComponentBuilder,
	ButtonBuilder,
	ButtonStyle,
	SlashCommandBuilder,
	SlashCommandBooleanOption
} from 'discord.js';


// Diagnostic command to measure Discord API and websocket latency
@ApplyOptions<Command.Options>({
	name: 'ping',
	description: 'Check the current websocket heartbeat and interaction round-trip time.',
	detailedDescription: {
		summary: "Measures Jasper's websocket heartbeat alongside the time Discord took to respond to this interaction.",
		chatInputUsage: '/ping',
		messageUsage: '{{prefix}}ping',
		examples: ['/ping', '{{prefix}}ping'],
		notes: ['Latency values update every time you run the command.']
	},
	aliases: ['latency'],
	fullCategory: ['General'],
	cooldownScope: BucketScope.User,
	// requiredClientPermissions: ['SendMessages'],
	// Validates user has required role permissions before execution
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: [
					'allowedAdminRoles',
					'allowedStaffRoles',
					'allowedTagAdminRoles',
					'allowedTagRoles',
					'supportRoles'
				] as const,
				allowManageGuild: false,
				errorMessage: 'You need an allowed tag role, staff role, or admin role to use this command.'
			}
		}
	],
	runIn: [CommandOptionsRunTypeEnum.Dm, CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends Command {
	// Supports both server and user-installed app installations
	private readonly integrationTypes: ApplicationIntegrationType[] = [
		ApplicationIntegrationType.GuildInstall,
		ApplicationIntegrationType.UserInstall
	];
	// Defines where command can be used: bot DMs, guilds, and private channels
	private readonly contexts: InteractionContextType[] = [
		InteractionContextType.BotDM,
		InteractionContextType.Guild,
		InteractionContextType.PrivateChannel
	];


	// Registers the /ping slash command with Discord API including ephemeral option
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addBooleanOption((option: SlashCommandBooleanOption) =>
					option.setName('ephemeral').setDescription('Whether the response should be visible only to you.').setRequired(false)
				)
		);
	}


	// Handles command execution: defers reply, calculates latency, and sends Components v2 UI
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		try {
			const isEphemeral = interaction.options.getBoolean('ephemeral') ?? false;
			// Defer immediately to show "thinking" state and prevent timeout
			await interaction.deferReply({ flags: isEphemeral ? ['Ephemeral'] : [] });
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
			// Calculate round-trip latency from command creation to now
			const latency = Date.now() - interaction.createdTimestamp;
			const components = this.buildLatencyComponents(latency);

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


	// Builds Components v2 UI with websocket and API latency metrics plus Discord status link
	private buildLatencyComponents(latency: number): ContainerBuilder[] {
		const websocketPing = Math.round(this.container.client.ws.ping);

		// Create container with latency displays, separator, and status page link button
		return [
			new ContainerBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`### Discord API Latency\n\`\`\`\n[ ${websocketPing}ms ]\n\`\`\`\n### Bot Latency\n\`\`\`\n[ ${latency}ms ]\n\`\`\``
					)
				)
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
				.addActionRowComponents(
					new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
						new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Discord Status Page').setURL('https://discordstatus.com/')
					)
				)
		];
	}
}
