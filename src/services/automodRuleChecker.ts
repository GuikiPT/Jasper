import { readFileSync } from 'fs';
import { join } from 'path';
import { srcDir } from '../lib/constants.js';
import { DiscordInviteLinkRegex, UserOrMemberMentionRegex, EmojiRegex, MessageLinkRegex, WebhookRegex } from '@sapphire/discord-utilities';
import { container } from '@sapphire/pieces';

interface AutomodRule {
	name: string;
	blockedWords: string[];
	regexPatterns: string[];
	allowedWords: string[];
	mentionTotalLimit: number | null;
	mentionRaidProtectionEnabled: boolean;
}

interface AutomodRules {
	rules: Record<string, AutomodRule>;
}

interface LegacyAutomodRule {
	name: string;
	blockedWords?: string[];
	regexPatterns?: string[];
	allowedWords?: string[];
	mentionTotalLimit?: number | null;
	mentionRaidProtectionEnabled?: boolean;
}

interface LegacyAutomodRules {
	rules: Record<string, LegacyAutomodRule>;
}

interface ExportedAutomodRule {
	id: string;
	name: string;
	enabled?: boolean;
	trigger?: {
		raw?: {
			keywordFilter?: string[];
			regexPatterns?: string[];
			allowList?: string[];
			mentionTotalLimit?: number | null;
			mentionRaidProtectionEnabled?: boolean;
		};
	};
}

type AutomodMatchType = 'word' | 'regex' | 'mention';

export interface AutomodMatch {
	matchedRule: string;
	matchedRuleId: string;
	matchType: AutomodMatchType;
	matchedPattern: string;
	caughtText?: string;
}

export interface AutomodCheckResult {
	isBlocked: boolean;
	matchedRule?: string;
	matchedRuleId?: string;
	matchType?: AutomodMatchType;
	matchedPattern?: string;
	caughtText?: string;
	isAllowed?: boolean;
	allowedPattern?: string;
	allMatches?: AutomodMatch[];
	matchCount?: number;
}

interface RuleCheckResult {
	isAllowed: boolean;
	allowedPattern?: string;
	matches: AutomodMatch[];
}

// Service for checking content against configurable automod rules
export class AutomodRuleChecker {
	private rules: AutomodRules = { rules: {} };

	constructor() {
		this.loadRules();
	}

	// Load automod rules from JSON file at startup
	private loadRules(): void {
		try {
			const rulesPath = join(srcDir, 'data', 'automod-rules.json');
			const rulesData = readFileSync(rulesPath, 'utf-8');
			this.rules = this.normalizeRules(JSON.parse(rulesData));
		} catch (error) {
			container.logger.error('Failed to load automod rules:', error);
			this.rules = { rules: {} };
		}
	}

	private normalizeRules(rawRules: unknown): AutomodRules {
		if (this.isLegacyRulesShape(rawRules)) {
			return {
				rules: Object.fromEntries(Object.entries(rawRules.rules).map(([ruleId, rule]) => [ruleId, this.normalizeLegacyRule(rule)]))
			};
		}

		if (Array.isArray(rawRules)) {
			const normalizedRules: Record<string, AutomodRule> = {};

			for (const rawRule of rawRules) {
				if (!this.isExportedRule(rawRule) || rawRule.enabled === false) {
					continue;
				}

				normalizedRules[rawRule.id] = this.normalizeExportedRule(rawRule);
			}

			return { rules: normalizedRules };
		}

		throw new Error('Unsupported automod rules format.');
	}

	private isLegacyRulesShape(value: unknown): value is LegacyAutomodRules {
		return typeof value === 'object' && value !== null && 'rules' in value && typeof (value as LegacyAutomodRules).rules === 'object';
	}

	private isExportedRule(value: unknown): value is ExportedAutomodRule {
		return typeof value === 'object' && value !== null && typeof (value as ExportedAutomodRule).id === 'string' && typeof (value as ExportedAutomodRule).name === 'string';
	}

	private normalizeLegacyRule(rule: LegacyAutomodRule): AutomodRule {
		return {
			name: rule.name,
			blockedWords: this.normalizePatternList(rule.blockedWords),
			regexPatterns: this.normalizePatternList(rule.regexPatterns),
			allowedWords: this.normalizePatternList(rule.allowedWords),
			mentionTotalLimit: typeof rule.mentionTotalLimit === 'number' ? rule.mentionTotalLimit : null,
			mentionRaidProtectionEnabled: rule.mentionRaidProtectionEnabled ?? false
		};
	}

	private normalizeExportedRule(rule: ExportedAutomodRule): AutomodRule {
		const rawTrigger = rule.trigger?.raw;

		return {
			name: rule.name,
			blockedWords: this.normalizePatternList(rawTrigger?.keywordFilter),
			regexPatterns: this.normalizePatternList(rawTrigger?.regexPatterns),
			allowedWords: this.normalizePatternList(rawTrigger?.allowList),
			mentionTotalLimit: typeof rawTrigger?.mentionTotalLimit === 'number' ? rawTrigger.mentionTotalLimit : null,
			mentionRaidProtectionEnabled: rawTrigger?.mentionRaidProtectionEnabled ?? false
		};
	}

	private normalizePatternList(patterns?: string[]): string[] {
		return (patterns ?? [])
			.filter((pattern): pattern is string => typeof pattern === 'string')
			.map((pattern) => this.normalizePattern(pattern))
			.filter((pattern) => pattern.length > 0);
	}

	private normalizePattern(pattern: string): string {
		let normalized = pattern.trim();

		while (normalized.length >= 2 && normalized.startsWith('"') && normalized.endsWith('"')) {
			normalized = normalized.slice(1, -1).trim();
		}

		return normalized;
	}

	// Check content against all rules, return detailed result with all matches
	public checkContent(content: string): AutomodCheckResult {
		const allMatches: AutomodMatch[] = [];
		let allowedResult: AutomodCheckResult | null = null;

		// Check content against each rule
		for (const [ruleId, rule] of Object.entries(this.rules.rules)) {
			const ruleResult = this.checkAgainstRule(content, rule, ruleId);

			// Track first explicit allowlist match
			if (ruleResult.isAllowed && !allowedResult) {
				allowedResult = {
					isBlocked: false,
					matchedRule: rule.name,
					matchedRuleId: ruleId,
					isAllowed: true,
					allowedPattern: ruleResult.allowedPattern
				};
			}

			// Accumulate all violation matches
			allMatches.push(...ruleResult.matches);
		}

		// Allowlist takes precedence over violations
		if (allowedResult) {
			return {
				...allowedResult,
				allMatches,
				matchCount: allMatches.length
			};
		}

		// Return blocked result with all matches
		if (allMatches.length > 0) {
			const firstMatch = allMatches[0];
			return {
				isBlocked: true,
				matchedRule: firstMatch.matchedRule,
				matchedRuleId: firstMatch.matchedRuleId,
				matchType: firstMatch.matchType,
				matchedPattern: firstMatch.matchedPattern,
				caughtText: firstMatch.caughtText,
				allMatches,
				matchCount: allMatches.length
			};
		}

		// Clean content
		return {
			isBlocked: false,
			allMatches: [],
			matchCount: 0
		};
	}

	// Check content against a single rule, collecting all matches
	private checkAgainstRule(content: string, rule: AutomodRule, ruleId: string): RuleCheckResult {
		const lowerContent = content.toLowerCase();
		const matches: AutomodMatch[] = [];

		// Check allowlist first (short-circuit if allowed)
		for (const allowedPattern of rule.allowedWords) {
			if (this.matchesPattern(lowerContent, allowedPattern.toLowerCase())) {
				return {
					isAllowed: true,
					allowedPattern: allowedPattern,
					matches: []
				};
			}
		}

		// Collect all word/phrase matches
		for (const blockedWord of rule.blockedWords) {
			if (this.matchesPattern(lowerContent, blockedWord.toLowerCase())) {
				matches.push({
					matchedRule: rule.name,
					matchedRuleId: ruleId,
					matchType: 'word',
					matchedPattern: blockedWord
				});
			}
		}

		// Collect all regex pattern matches
		for (const regexPattern of rule.regexPatterns) {
			const regex = this.buildRegex(regexPattern);
			if (regex && regex.test(content)) {
				matches.push({
					matchedRule: rule.name,
					matchedRuleId: ruleId,
					matchType: 'regex',
					matchedPattern: regexPattern
				});
			}
		}

		const mentionMatch = this.checkMentionLimit(content, rule, ruleId);
		if (mentionMatch) {
			matches.push(mentionMatch);
		}

		return {
			isAllowed: false,
			matches
		};
	}

	private checkMentionLimit(content: string, rule: AutomodRule, ruleId: string): AutomodMatch | null {
		if (rule.mentionTotalLimit === null || rule.mentionTotalLimit < 1) {
			return null;
		}

		const mentionMatches = this.extractMentions(content);
		if (mentionMatches.length <= rule.mentionTotalLimit) {
			return null;
		}

		return {
			matchedRule: rule.name,
			matchedRuleId: ruleId,
			matchType: 'mention',
			matchedPattern: `Max ${rule.mentionTotalLimit} mentions`,
			caughtText: `${mentionMatches.length} mentions detected`
		};
	}

	private extractMentions(content: string): string[] {
		return content.match(/<@!?\d+>|<@&\d+>|@(everyone|here)\b/gi) ?? [];
	}

	// Build regex from pattern string, handling special Discord patterns
	private buildRegex(regexPattern: string): RegExp | null {
		try {
			// Use predefined Sapphire regexes for Discord-specific patterns
			switch (regexPattern) {
				case 'discord-invite':
					return DiscordInviteLinkRegex;
				case 'user-mention':
					return UserOrMemberMentionRegex;
				case 'custom-emoji':
					return EmojiRegex;
				case 'message-link':
					return MessageLinkRegex;
				case 'webhook':
					return WebhookRegex;
				default:
					return this.buildCustomRegex(regexPattern);
			}
		} catch (error) {
			container.logger.warn(`Invalid regex pattern: ${regexPattern}`, error);
			return null;
		}
	}

	private buildCustomRegex(regexPattern: string): RegExp {
		const normalizedPattern = this.normalizePattern(regexPattern);
		const flags = new Set(['i', 'm']);

		for (const match of normalizedPattern.matchAll(/\(\?([imsu]+)\)/g)) {
			for (const flag of match[1]) {
				flags.add(flag);
			}
		}

		if (normalizedPattern.includes('\\p{') || normalizedPattern.includes('\\P{')) {
			flags.add('u');
		}

		const cleanedPattern = normalizedPattern.replace(/\(\?([imsu]+)\)/g, '');
		return new RegExp(cleanedPattern, [...flags].join(''));
	}

	// Match content against pattern with wildcard and special character handling
	private matchesPattern(content: string, pattern: string): boolean {
		// Exact match
		if (pattern === content) {
			return true;
		}

		// Wildcard patterns (*) converted to regex
		if (pattern.includes('*')) {
			return this.matchesWildcard(content, pattern);
		}

		// Special patterns (Discord mentions, URLs) use simple substring match
		if (this.isSpecialPattern(pattern)) {
			return content.toLowerCase().includes(pattern.toLowerCase());
		}

		// Normal word matching with boundary detection
		return this.matchesWord(content, pattern);
	}

	// Check if pattern contains special characters requiring substring matching
	private isSpecialPattern(pattern: string): boolean {
		return pattern.includes('<@') || pattern.includes('discord.gg') || pattern.includes('http');
	}

	// Match wildcard patterns, respecting word boundaries for normal words
	private matchesWildcard(content: string, pattern: string): boolean {
		try {
			// Escape special regex chars, then convert * to .*
			const regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');

			const hasSpecialChars = /[<>@#.\-\/\\]/.test(pattern);
			const regex = hasSpecialChars ? new RegExp(regexPattern, 'i') : new RegExp(`\\b${regexPattern}\\b`, 'i');

			return regex.test(content);
		} catch (error) {
			container.logger.warn(`Invalid wildcard pattern: ${pattern}`, error);
			return false;
		}
	}

	// Match normal word with or without special characters
	private matchesWord(content: string, pattern: string): boolean {
		const hasSpecialChars = /[<>@#.\-\/\\]/.test(pattern);

		if (hasSpecialChars) {
			// Simple substring match for special chars
			return content.toLowerCase().includes(pattern.toLowerCase());
		}

		// Word boundary match for normal words
		try {
			const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
			return regex.test(content);
		} catch (error) {
			container.logger.warn(`Invalid pattern: ${pattern}`, error);
			return false;
		}
	}

	// Get all loaded rules
	public getRules(): Record<string, AutomodRule> {
		return this.rules.rules;
	}

	// Get specific rule by ID
	public getRule(ruleId: string): AutomodRule | undefined {
		return this.rules.rules[ruleId];
	}

	// Get map of rule IDs to their display names
	public getRuleNames(): Record<string, string> {
		const names: Record<string, string> = {};
		for (const [ruleId, rule] of Object.entries(this.rules.rules)) {
			names[ruleId] = rule.name;
		}
		return names;
	}
}

// Augment Sapphire container with automod checker instance
declare module '@sapphire/pieces' {
	interface Container {
		automodRuleChecker: AutomodRuleChecker;
	}
}
