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
import { type AutomodCheckResult, type AutomodMatch } from '../../services/automodRuleChecker.js';

// Pagination configuration for violation display
const AUTOMOD_CHECK_CUSTOM_ID = 'automod-check';
const VIOLATIONS_PER_PAGE = 5;

// Interactive command for testing content against automod rules
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
	// Restrict to staff and admin roles only
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['allowedStaffRoles', 'allowedAdminRoles'] as const,
				allowManageGuild: false,
				errorMessage: 'You need staff or admin permissions to use the automod-check command.'
			}
		}
	]
	// requiredClientPermissions: ['SendMessages']
})
export class AutomodCheckCommand extends Command {
	// Guild-only installation and execution context
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	// Register slash command with content and ephemeral options
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

	// Handle /automod-check: defer, run check, and display paginated results
	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return replyWithComponent(interaction, 'This command can only be used in a server.', true);
		}

		const content = interaction.options.getString('content', true);
		const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;

		try {
			await interaction.deferReply({ flags: isEphemeral ? MessageFlags.Ephemeral : [] });
		} catch (error) {
			this.container.logger.error('[AutomodCheck] Failed to defer interaction', error, {
				guildId: interaction.guildId,
				userId: interaction.user.id,
				interactionId: interaction.id
			});
			if (!interaction.deferred && !interaction.replied) {
				return replyWithComponent(interaction, 'I could not start the automod check because the reply was rejected. Please try again.', true);
			}
			try {
				return editReplyWithComponent(interaction, 'I could not start the automod check because the reply was rejected. Please try again.');
			} catch (replyError) {
				this.container.logger.error('[AutomodCheck] Failed to send defer fallback', replyError, {
					guildId: interaction.guildId,
					userId: interaction.user.id,
					interactionId: interaction.id
				});
				return;
			}
		}

		try {
			const result = this.container.automodRuleChecker.checkContent(content);
			const components = await this.createResultComponents(content, result, interaction.user.id);

			const reply = await interaction.editReply({
				components: components,
				flags: ['IsComponentsV2']
			});

			this.container.logger.debug('[AutomodCheck] Responded with automod analysis', {
				guildId: interaction.guildId,
				userId: interaction.user.id,
				interactionId: interaction.id,
				isBlocked: result.isBlocked,
				matchCount: result.matchCount ?? (result.isBlocked ? 1 : 0),
				isEphemeral
			});

			return reply;
		} catch (error) {
			this.container.logger.error('[AutomodCheck] Failed to check content', error, {
				guildId: interaction.guildId,
				userId: interaction.user.id,
				interactionId: interaction.id,
				content: content.substring(0, 100)
			});

			try {
				return editReplyWithComponent(
					interaction,
					'An error occurred while checking the content against automod rules. Please try again later.'
				);
			} catch (replyError) {
				this.container.logger.error('[AutomodCheck] Failed to send error fallback', replyError, {
					guildId: interaction.guildId,
					userId: interaction.user.id,
					interactionId: interaction.id
				});
				return;
			}
		}
	}

	// Build Components v2 containers with color-coded results and pagination
	public async createResultComponents(content: string, result: AutomodCheckResult, userId: string, currentPage: number = 1) {
		try {
			const { createPaginationButtons } = await import('../../lib/components.js');

			const containers: ContainerBuilder[] = [];

			// Content display container (neutral)
			containers.push(this.buildContentContainer(content));

			// Result container (color-coded: red for blocked, green for allowed/clean)
			containers.push(this.buildResultContainer(content, result, currentPage));

			// Add pagination if needed
			if (result.isBlocked && result.allMatches && result.allMatches.length > VIOLATIONS_PER_PAGE) {
				const totalPages = Math.ceil(result.allMatches.length / VIOLATIONS_PER_PAGE);
				const validPage = Math.max(1, Math.min(currentPage, totalPages));
				const buttons = createPaginationButtons(validPage, totalPages, AUTOMOD_CHECK_CUSTOM_ID, { ownerId: userId });
				containers.push(...(buttons as any[]));
			}

			return containers;
		} catch (error) {
			this.container.logger.error('[AutomodCheck] Failed to build result components', error, {
				userId,
				page: currentPage
			});
			throw error;
		}
	}

	// Build neutral container showing the checked content
	private buildContentContainer(content: string): ContainerBuilder {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Automod Rule Check'));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		const truncated = content.length > 500 ? content.substring(0, 497) + '...' : content;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Checked Content\n${this.formatContentPreview(truncated)}`));

		return container;
	}

	// Build result container with violations, allowed status, or clean status
	private buildResultContainer(content: string, result: AutomodCheckResult, currentPage: number): ContainerBuilder {
		const container = new ContainerBuilder();

		if (result.isBlocked) {
			this.buildBlockedResult(container, content, result, currentPage);
		} else if (result.isAllowed) {
			this.buildAllowedResult(container, result);
		} else {
			this.buildCleanResult(container);
		}

		// Footer with rule count and disclaimer
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.buildFooter(result)));

		return container;
	}

	// Build blocked result section with red accent and violation details
	private buildBlockedResult(container: ContainerBuilder, content: string, result: AutomodCheckResult, currentPage: number): void {
		container.setAccentColor(0xff4444);

		const matchCount = result.matchCount || 1;
		const header = '## 🚫 Blocked';
		const subtitle =
			matchCount > 1 ? `This content matched ${matchCount} automod rules.` : 'This content matched 1 automod rule.';

		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(subtitle));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

		if (matchCount > 1 && result.allMatches && result.allMatches.length > 1) {
			this.addPaginatedViolations(container, content, result, currentPage);
		} else {
			this.addSingleViolation(container, content, result);
		}
	}

	// Add paginated violation list when multiple matches exist
	private addPaginatedViolations(container: ContainerBuilder, content: string, result: AutomodCheckResult, currentPage: number): void {
		const totalPages = Math.ceil(result.allMatches!.length / VIOLATIONS_PER_PAGE);
		const validPage = Math.max(1, Math.min(currentPage, totalPages));
		const startIndex = (validPage - 1) * VIOLATIONS_PER_PAGE;
		const endIndex = Math.min(startIndex + VIOLATIONS_PER_PAGE, result.allMatches!.length);
		const pageMatches = result.allMatches!.slice(startIndex, endIndex);

		if (totalPages > 1) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Violations'));
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`-# Page ${validPage}/${totalPages} • Showing ${startIndex + 1}-${endIndex} of ${result.allMatches!.length}`)
			);
		}

		pageMatches.forEach((match, localIndex) => {
			const globalIndex = startIndex + localIndex + 1;
			this.addViolationDetails(container, content, match, globalIndex);

			if (localIndex < pageMatches.length - 1) {
				container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
			}
		});
	}

	// Add single violation details (backwards compatibility for single match)
	private addSingleViolation(container: ContainerBuilder, content: string, result: AutomodCheckResult): void {
		this.addViolationDetails(
			container,
			content,
			{
				matchedRule: result.matchedRule!,
				matchedRuleId: result.matchedRuleId!,
				matchType: result.matchType!,
				matchedPattern: result.matchedPattern!,
				caughtText: result.caughtText
			},
			undefined
		);
	}

	// Add details for a specific violation match
	private addViolationDetails(container: ContainerBuilder, content: string, match: AutomodMatch, index?: number): void {
		const escapedPattern = this.escapePattern(match.matchedPattern);
		const caughtText = this.escapePattern(match.caughtText ?? this.findCaughtText(content, match.matchedPattern));
		const title = typeof index === 'number' ? `### ${index}. ${match.matchedRule}` : `### ${match.matchedRule}`;

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${title}\n> - Type: \`${this.formatMatchType(match.matchType)}\`\n> - Pattern: \`${escapedPattern}\`\n> - Caught: \`${caughtText}\``
			)
		);
	}

	private formatMatchType(matchType: AutomodCheckResult['matchType']): string {
		switch (matchType) {
			case 'word':
				return 'Word/Phrase Match';
			case 'regex':
				return 'Regex Pattern';
			case 'mention':
				return 'Mention Limit';
			default:
				return 'Unknown';
		}
	}

	// Build allowed result section with green accent
	private buildAllowedResult(container: ContainerBuilder, result: AutomodCheckResult): void {
		container.setAccentColor(0x00ff00);
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Allowed'));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('This content matched an explicit allowlist entry.'));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${result.matchedRule}\n> - Allowlist Match: \`${this.escapePattern(result.allowedPattern ?? 'Unknown')}\``
			)
		);
	}

	// Build clean result section with green accent
	private buildCleanResult(container: ContainerBuilder): void {
		container.setAccentColor(0x00ff00);
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Clean'));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No configured automod rules matched this content.'));
	}

	// Build footer text with rule count and match information
	private buildFooter(result: AutomodCheckResult): string {
		const rules = this.container.automodRuleChecker.getRuleNames();
		const ruleCount = Object.keys(rules).length;
		let footer = `-# Checked against ${ruleCount} automod rule${ruleCount !== 1 ? 's' : ''}`;

		if (result.isBlocked && result.matchCount && result.matchCount > 1) {
			footer += ` • Found ${result.matchCount} violations`;
		}

		footer += ' • Does not check for bypasses';
		return footer;
	}

	private formatContentPreview(content: string): string {
		const safeContent = content.replace(/```/g, '``\\`');
		return `\`\`\`\n${safeContent}\n\`\`\``;
	}

	// Escape pattern for safe display in markdown code blocks
	private escapePattern(pattern: string): string {
		return pattern.replace(/`/g, '\\`').replace(/\\/g, '\\\\');
	}

	// Find actual text caught by a pattern (handles regex, wildcards, and exact matches)
	private findCaughtText(content: string, pattern: string): string {
		// Try regex patterns first
		if (this.isRegexPattern(pattern)) {
			const match = this.findRegexMatch(content, pattern);
			if (match) return match;
		}

		// Try wildcard patterns
		if (pattern.includes('*')) {
			const match = this.findWildcardMatch(content, pattern);
			if (match) return match;
		}

		// Try exact match
		const match = this.findExactMatch(content, pattern);
		if (match) return match;

		// Fallback: clean pattern
		return pattern.replace(/\*/g, '').replace(/\\b|\\w|\\d|\\s|\\|\[|\]|\(|\)/g, '');
	}

	// Check if pattern contains regex syntax
	private isRegexPattern(pattern: string): boolean {
		return /[\\()[\]{}^$+?|]/.test(pattern) && !pattern.includes('*');
	}

	// Find text matching a regex pattern
	private findRegexMatch(content: string, pattern: string): string | null {
		try {
			const regex = new RegExp(pattern, 'gi');
			const match = regex.exec(content);
			if (match) return match[0];

			// Try without word boundaries as fallback
			const simplified = pattern.replace(/\\b/g, '');
			const simpleMatch = content.match(new RegExp(simplified, 'gi'));
			if (simpleMatch) return simpleMatch[0];
		} catch {
			// Invalid regex, skip
		}

		return null;
	}

	// Find text matching a wildcard pattern (e.g., discord.gg/*, sigma*)
	private findWildcardMatch(content: string, pattern: string): string | null {
		const basePattern = pattern.replace(/\*/g, '');
		if (basePattern.length === 0) return pattern;

		try {
			const hasSpecialChars = /[<>@#.\-\/\\]/.test(pattern);

			if (hasSpecialChars) {
				// Special patterns like discord.gg/* - match full phrase
				const regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^\\s]*');
				const match = content.match(new RegExp(regexPattern, 'i'));
				if (match) return match[0];
			} else {
				// Word patterns like sigma* - match word starting with base
				const words = content.split(/\s+/);
				for (const word of words) {
					if (word.toLowerCase().startsWith(basePattern.toLowerCase())) {
						return word.replace(/[^\w]/g, '');
					}
				}
			}
		} catch {
			// Invalid pattern, skip
		}

		return null;
	}

	// Find exact pattern match with word boundaries
	private findExactMatch(content: string, pattern: string): string | null {
		const lowerContent = content.toLowerCase();
		const lowerPattern = pattern.toLowerCase();
		const hasSpecialChars = /[<>@#.\-\/\\]/.test(pattern);

		if (hasSpecialChars) {
			// Special chars: simple substring match
			if (lowerContent.includes(lowerPattern)) {
				const index = lowerContent.indexOf(lowerPattern);
				return content.substring(index, index + pattern.length);
			}
		} else {
			// Normal words: use word boundary matching
			const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
			const match = content.match(regex);
			if (match) return match[0];
		}

		return null;
	}
}
