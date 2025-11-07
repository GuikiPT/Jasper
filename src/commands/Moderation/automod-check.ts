// automod-check module within commands/Moderation
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	SlashCommandBuilder,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	type ChatInputCommandInteraction
} from 'discord.js';
import { replyWithComponent, editReplyWithComponent } from '../../lib/components.js';
import { type AutomodCheckResult } from '../../services/automodRuleChecker.js';

// Implements the moderation `automod-check` command for checking words/phrases against automod rules.

@ApplyOptions<Command.Options>({
	name: 'automod-check',
	description: 'Check if a word or phrase would be blocked by automod rules.',
	detailedDescription: {
		summary: 'Analyzes the provided word or phrase against all configured automod rules to determine if it would be blocked.',
		chatInputUsage: '/automod-check content:"word or phrase" [ephemeral:true]',
		examples: [
			'/automod-check content:"test word"',
			'/automod-check content:"suspicious link" ephemeral:false',
			'/automod-check content:"@everyone" ephemeral:true'
		],
		notes: [
			'Only staff and admin roles can use this command.',
			'Use ephemeral:true to make the response visible only to you.',
			'The command checks against all configured automod rule categories.',
			'Shows which specific rule and pattern matched, if any.'
		]
	},
	fullCategory: ['Moderation'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 3,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['allowedStaffRoles', 'allowedAdminRoles'] as const,
				allowManageGuild: false,
				errorMessage: 'You need staff or admin permissions to use the automod-check command.'
			}
		}
	],
	requiredClientPermissions: ['SendMessages']
})
export class AutomodCheckCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			new SlashCommandBuilder()
				.setName(this.name)
				.setDescription(this.description)
				.addStringOption((option) =>
					option.setName('content').setDescription('The word or phrase to check against automod rules').setRequired(true).setMaxLength(1000)
				)
				.addBooleanOption((option) =>
					option.setName('ephemeral').setDescription('Whether to make the response visible only to you (default: true)').setRequired(false)
				)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
		);
	}

	/** Handles the slash command entry-point for checking automod rules. */
	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return replyWithComponent(interaction, 'This command can only be used in a server.', true);
		}

		const content = interaction.options.getString('content', true);
		const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;

		await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

		try {
			const result = this.container.automodRuleChecker.checkContent(content);
			const components = this.createResultComponents(content, result);

			return interaction.editReply({
				components: components,
				flags: ['IsComponentsV2']
			});
		} catch (error) {
			this.container.logger.error('[AutomodCheck] Failed to check content', error, {
				guildId: interaction.guildId,
				userId: interaction.user.id,
				content: content.substring(0, 100)
			});

			return editReplyWithComponent(interaction, 'An error occurred while checking the content against automod rules. Please try again later.');
		}
	}

	/** Creates two Components V2 containers: one for content, one for results with color coding. */
	private createResultComponents(content: string, result: AutomodCheckResult): ContainerBuilder[] {
		// Container 1: Content Display (neutral color)
		const contentContainer = new ContainerBuilder();
		contentContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Automod Rule Check'));
		contentContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		const truncatedContent = content.length > 500 ? content.substring(0, 497) + '...' : content;
		contentContainer.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`**📝 Checked Content:**\n\`\`\`\n${truncatedContent}\n\`\`\``)
		);

		// Container 2: Results Display (colored based on result)
		const resultContainer = new ContainerBuilder();

		if (result.isBlocked) {
			// Red container for blocked content
			resultContainer.setAccentColor(0xff4444);

			const matchCount = result.matchCount || 1;
			const headerText = matchCount > 1 ? `## 🚫 BLOCKED (${matchCount} matches)` : '## 🚫 BLOCKED';
			const subText =
				matchCount > 1
					? `This content would be flagged by automod (${matchCount} rule violations found)`
					: 'This content would be flagged by automod';

			resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
			resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(subText));

			// Add spacing
			resultContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

			if (matchCount > 1 && result.allMatches && result.allMatches.length > 1) {
				// Show all matches when there are multiple
				resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('## **All Rule Violations:**'));

				result.allMatches.forEach((match, index) => {
					// Escape backticks and other markdown characters in the pattern
					const escapedPattern = match.matchedPattern.replace(/`/g, '\\`').replace(/\\/g, '\\\\');

					resultContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`### ${index + 1}. **Rule:** \`${match.matchedRuleId} - ${match.matchedRule}\``)
					);
					resultContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`- **Type:** \`${match.matchType === 'word' ? 'Word/Phrase Match' : 'Regex Pattern'}\``)
					);
					resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- **Pattern:** \`${escapedPattern}\``));
				});
			} else {
				// Show single match details (backwards compatibility)
				// Escape backticks and other markdown characters in the pattern
				const escapedPattern = result.matchedPattern!.replace(/`/g, '\\`').replace(/\\/g, '\\\\');

				resultContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`### - **Rule:** \`${result.matchedRuleId} - ${result.matchedRule}\``)
				);
				resultContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`- **Type:** \`${result.matchType === 'word' ? 'Word/Phrase Match' : 'Regex Pattern'}\``)
				);
				resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- **Pattern:** \`${escapedPattern}\``));
			}
		} else if (result.isAllowed) {
			// Green container for explicitly allowed content
			resultContainer.setAccentColor(0x00ff00);
			resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ ALLOWED'));
			resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('This content is explicitly allowed'));

			// Add spacing
			resultContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

			// Rule details
			resultContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`**Rule:** \`${result.matchedRuleId} - ${result.matchedRule}\`\n` + `**Exception:** \`${result.allowedPattern}\``
				)
			);
		} else {
			// Green container for clean content
			resultContainer.setAccentColor(0x00ff00);
			resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ CLEAN'));
			resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('This content would not be flagged by automod'));
		}

		// Add footer to result container
		resultContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		const rules = this.container.automodRuleChecker.getRuleNames();
		const ruleCount = Object.keys(rules).length;

		let footerText = `-# Checked against ${ruleCount} automod rule${ruleCount !== 1 ? 's' : ''}`;

		// Add match count information if there are multiple matches
		if (result.isBlocked && result.matchCount && result.matchCount > 1) {
			footerText += ` • Found ${result.matchCount} violations`;
		}

		footerText += ' • Does not check for bypasses';
		resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

		return [contentContainer, resultContainer];
	}
}
