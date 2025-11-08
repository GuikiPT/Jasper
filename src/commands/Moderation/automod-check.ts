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

// Constants for automod-check pagination
const AUTOMOD_CHECK_CUSTOM_ID = 'automod-check';
const AUTOMOD_CHECK_VIOLATIONS_PER_PAGE = 5;

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
			const components = await this.createResultComponents(content, result, interaction.user.id);

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

	/** Creates Components V2 containers with pagination support for violations. */
	public async createResultComponents(content: string, result: AutomodCheckResult, userId: string, currentPage: number = 1) {
		const { createPaginationButtons } = await import('../../lib/components.js');

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
				// Use pagination for multiple violations
				const violationsPerPage = AUTOMOD_CHECK_VIOLATIONS_PER_PAGE;
				const totalPages = Math.ceil(result.allMatches.length / violationsPerPage);
				const validPage = Math.max(1, Math.min(currentPage, totalPages));

				const startIndex = (validPage - 1) * violationsPerPage;
				const endIndex = Math.min(startIndex + violationsPerPage, result.allMatches.length);
				const pageMatches = result.allMatches.slice(startIndex, endIndex);

				if (totalPages > 1) {
					resultContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`## **Rule Violations:** (Page ${validPage}/${totalPages})`)
					);
				} else {
					resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('## **All Rule Violations:**'));
				}

				pageMatches.forEach((match, localIndex) => {
					const globalIndex = startIndex + localIndex + 1;
					const escapedPattern = match.matchedPattern.replace(/`/g, '\\`').replace(/\\/g, '\\\\');
					const caughtText = this.findCaughtText(content, match.matchedPattern);

					resultContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`### ${globalIndex}. **Rule:** \`${match.matchedRuleId} - ${match.matchedRule}\``)
					);
					resultContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`- **Type:** \`${match.matchType === 'word' ? 'Word/Phrase Match' : 'Regex Pattern'}\``)
					);
					resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- **Pattern:** \`${escapedPattern}\``));
					resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- **Caught:** \`${caughtText}\``));
				});

				if (totalPages > 1) {
					resultContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
					resultContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`*Showing violations ${startIndex + 1}-${endIndex} of ${result.allMatches.length}*`)
					);
				}
			} else {
				// Show single match details (backwards compatibility)
				const escapedPattern = result.matchedPattern!.replace(/`/g, '\\`').replace(/\\/g, '\\\\');
				const caughtText = this.findCaughtText(content, result.matchedPattern!);

				resultContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`### - **Rule:** \`${result.matchedRuleId} - ${result.matchedRule}\``)
				);
				resultContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`- **Type:** \`${result.matchType === 'word' ? 'Word/Phrase Match' : 'Regex Pattern'}\``)
				);
				resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- **Pattern:** \`${escapedPattern}\``));
				resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- **Caught:** \`${caughtText}\``));
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

		const containers = [contentContainer, resultContainer];

		// Add pagination buttons if needed
		if (result.isBlocked && result.allMatches && result.allMatches.length > AUTOMOD_CHECK_VIOLATIONS_PER_PAGE) {
			const violationsPerPage = AUTOMOD_CHECK_VIOLATIONS_PER_PAGE;
			const totalPages = Math.ceil(result.allMatches.length / violationsPerPage);
			const validPage = Math.max(1, Math.min(currentPage, totalPages));

			const buttons = createPaginationButtons(validPage, totalPages, AUTOMOD_CHECK_CUSTOM_ID, {
				ownerId: userId
			});

			return [...containers, ...buttons];
		}

		return containers;
	}

	/** Find the actual text that was caught by a pattern. */
	private findCaughtText(content: string, pattern: string): string {
		const lowerContent = content.toLowerCase();
		const lowerPattern = pattern.toLowerCase();

		// Check if this is a regex pattern (contains regex characters but not simple wildcards)
		const isRegexPattern = /[\\()[\]{}^$+?|]/.test(pattern) && !pattern.includes('*');

		if (isRegexPattern) {
			// Handle regex patterns by actually testing them against the content
			try {
				// Test the regex against content to find actual matches
				const regex = new RegExp(pattern, 'gi');
				let match;
				const matches = [];
				while ((match = regex.exec(content)) !== null) {
					matches.push(match[0]);
					if (!regex.global) break;
				}

				if (matches.length > 0) {
					return matches[0]; // Return the first actual matched text
				}

				// If no matches but pattern is complex, try without word boundaries
				const simplifiedPattern = pattern.replace(/\\b/g, '');
				const simpleRegex = new RegExp(simplifiedPattern, 'gi');
				const simpleMatch = content.match(simpleRegex);
				if (simpleMatch) {
					return simpleMatch[0];
				}
			} catch (error) {
				// Skip invalid regex
			}

			// Final fallback for regex: try to find any word that might match the pattern intent
			const words = content.split(/\s+/);
			for (const word of words) {
				// Check if word contains typical slur patterns
				if (/n[i1!e]+[gjbpq]+[a]+[sz]*/i.test(word)) {
					return word.replace(/[^\w]/g, '');
				}
			}

			// Last resort: return a cleaned version of the pattern
			return 'pattern-match';
		} else if (pattern.includes('*')) {
			// Handle wildcard patterns - need to find individual word matches
			const basePattern = pattern.replace(/\*/g, '');

			if (basePattern.length === 0) {
				return pattern; // Pattern is just '*'
			}

			try {
				const hasSpecialChars = /[<>@#\.\-\/\\]/.test(pattern);

				if (hasSpecialChars) {
					// For special patterns like discord.gg/*, find the full match
					const regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^\\s]*');
					const regex = new RegExp(regexPattern, 'i');
					const match = content.match(regex);
					if (match) {
						return match[0];
					}
				} else {
					// For normal word patterns like sigma*, find word that starts with base
					const words = content.split(/\s+/);
					for (const word of words) {
						if (word.toLowerCase().startsWith(basePattern.toLowerCase())) {
							// Remove punctuation from end to get clean word
							return word.replace(/[^\w]/g, '');
						}
					}
				}
			} catch (error) {
				// Skip invalid patterns
			}
		} else {
			// Handle exact patterns
			const hasSpecialChars = /[<>@#\.\-\/\\]/.test(pattern);
			if (hasSpecialChars) {
				// For patterns with special characters, use simple contains
				if (lowerContent.includes(lowerPattern)) {
					// Find the actual case-preserved match
					const index = lowerContent.indexOf(lowerPattern);
					if (index !== -1) {
						return content.substring(index, index + pattern.length);
					}
				}
			} else {
				// For normal words, use word boundaries
				const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
				const match = content.match(regex);
				if (match) {
					return match[0];
				}
			}
		}

		// Fallback to pattern if no match found (shouldn't happen)
		return pattern.replace(/\*/g, '').replace(/\\b|\\w|\\d|\\s|\\|\[|\]|\(|\)/g, '');
	}
}
