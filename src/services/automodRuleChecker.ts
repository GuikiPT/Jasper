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
}

interface AutomodRules {
	rules: Record<string, AutomodRule>;
}

export interface AutomodMatch {
	matchedRule: string;
	matchedRuleId: string;
	matchType: 'word' | 'regex';
	matchedPattern: string;
}

export interface AutomodCheckResult {
	isBlocked: boolean;
	matchedRule?: string;
	matchedRuleId?: string;
	matchType?: 'word' | 'regex';
	matchedPattern?: string;
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
			this.rules = JSON.parse(rulesData);
		} catch (error) {
			container.logger.error('Failed to load automod rules:', error);
			this.rules = { rules: {} };
		}
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

		return {
			isAllowed: false,
			matches
		};
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
					// Custom patterns: case-insensitive + multiline
					return new RegExp(regexPattern, 'im');
			}
		} catch (error) {
			container.logger.warn(`Invalid regex pattern: ${regexPattern}`, error);
			return null;
		}
	}

	// Match content against pattern with wildcard and special character handling
	private matchesPattern(content: string, pattern: string): boolean {
		// Exact match
		if (pattern === content) {
			return true;
		}

		// Special patterns (Discord mentions, URLs) use simple substring match
		if (this.isSpecialPattern(pattern)) {
			return content.toLowerCase().includes(pattern.toLowerCase());
		}

		// Wildcard patterns (*) converted to regex
		if (pattern.includes('*')) {
			return this.matchesWildcard(content, pattern);
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
