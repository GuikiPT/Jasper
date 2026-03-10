// eval command – Owner-only slash command that opens a code input modal
import { ApplyOptions } from '@sapphire/decorators';
import { Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ApplicationIntegrationType,
	InteractionContextType,
	ModalBuilder,
	SlashCommandBuilder,
	SlashCommandBooleanOption,
	TextInputBuilder,
	TextInputStyle
} from 'discord.js';
import { EVAL_CODE_FIELD_ID, EVAL_MODAL_ID_PREFIX } from '../../lib/evalConstants.js';

/**
 * /eval – Shows a modal asking for arbitrary JavaScript code and executes it.
 *
 * The `ephemeral` option value is encoded into the modal custom ID so the
 * modal handler can read it: `eval-modal:1` (ephemeral) or `eval-modal:0` (public).
 *
 * Access is restricted to bot owners via the `OwnerOnly` precondition.
 */
@ApplyOptions<Command.Options>({
	name: 'eval',
	description: 'Execute arbitrary JavaScript code (bot owner only).',
	detailedDescription: {
		summary: 'Opens a modal that lets the bot owner run arbitrary JavaScript inside the bot process.',
		chatInputUsage: '/eval [ephemeral]',
		examples: ['/eval', '/eval ephemeral:false'],
		notes: [
			'Only the bot owner can use this command.',
			'Sensitive values such as the Discord token and environment secrets are always redacted from the output.',
			'The result is rendered as JSON inside a Components v2 container.',
			'Use ephemeral:false to make the result visible to everyone in the channel.'
		]
	},
	fullCategory: ['Owner'],
	preconditions: ['OwnerOnly'],
	runIn: [CommandOptionsRunTypeEnum.Dm, CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.BotDM, InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addBooleanOption((option: SlashCommandBooleanOption) =>
					option
						.setName('ephemeral')
						.setDescription('Whether the result should be visible only to you. Defaults to true.')
						.setRequired(false)
				)
		);
	}

	/** Encodes the ephemeral preference in the modal custom ID, then shows the modal. */
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;
		const customId = `${EVAL_MODAL_ID_PREFIX}:${isEphemeral ? '1' : '0'}`;

		const modal = new ModalBuilder()
			.setCustomId(customId)
			.setTitle('Eval – Execute Code')
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId(EVAL_CODE_FIELD_ID)
						.setLabel('Code')
						.setStyle(TextInputStyle.Paragraph)
						.setPlaceholder('// Use `return` to surface a value.\n// Available: client, container, interaction')
						.setRequired(true)
						.setMaxLength(4_000)
				)
			);

		try {
			await interaction.showModal(modal);
		} catch (error) {
			this.container.logger.error('[Eval] Failed to show eval modal', error, {
				userId: interaction.user.id,
				guildId: interaction.guildId ?? 'dm'
			});
		}
	}
}
