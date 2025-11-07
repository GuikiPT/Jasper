import { readFileSync } from 'fs';
import { join } from 'path';
import { srcDir } from '../lib/constants.js';
import { DiscordInviteLinkRegex, UserOrMemberMentionRegex, EmojiRegex, MessageLinkRegex, WebhookRegex } from '@sapphire/discord-utilities';

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

export class AutomodRuleChecker {
	private rules: AutomodRules = { rules: {} };

	constructor() {
		this.loadRules();
	}

	private loadRules(): void {
		try {
			const rulesPath = join(srcDir, 'data', 'automod-rules.json');
			const rulesData = readFileSync(rulesPath, 'utf-8');
			this.rules = JSON.parse(rulesData);
		} catch (error) {
			console.error('Failed to load automod rules:', error);
			this.rules = { rules: {} };
		}
	}

	/**
	 * Check if a word or phrase violates any automod rules
	 */
	public checkContent(content: string): AutomodCheckResult {
		const allMatches: AutomodMatch[] = [];
		let allowedResult: AutomodCheckResult | null = null;

		for (const [ruleId, rule] of Object.entries(this.rules.rules)) {
			const ruleResult = this.checkAgainstRule(content, rule, ruleId);

			// If content is explicitly allowed by this rule, track it
			if (ruleResult.isAllowed && !allowedResult) {
				allowedResult = {
					isBlocked: false,
					matchedRule: rule.name,
					matchedRuleId: ruleId,
					isAllowed: true,
					allowedPattern: ruleResult.allowedPattern
				};
			}

			// Add all matches from this rule to the global matches array
			allMatches.push(...ruleResult.matches);
		}

		// If content is explicitly allowed, return that result
		if (allowedResult) {
			return {
				...allowedResult,
				allMatches,
				matchCount: allMatches.length
			};
		}

		// If we have matches, return blocked result with all matches info
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

		return {
			isBlocked: false,
			allMatches: [],
			matchCount: 0
		};
	}

	/**
	 * Check content against a specific rule
	 */
	private checkAgainstRule(content: string, rule: AutomodRule, ruleId: string): RuleCheckResult {
		const lowerContent = content.toLowerCase();
		const matches: AutomodMatch[] = [];

		// First check if content is explicitly allowed
		for (const allowedPattern of rule.allowedWords) {
			if (this.matchesPattern(lowerContent, allowedPattern.toLowerCase())) {
				return {
					isAllowed: true,
					allowedPattern: allowedPattern,
					matches: []
				};
			}
		}

		// Check blocked words (with wildcard support) - collect ALL matches
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

		// Check regex patterns - collect ALL matches
		for (const regexPattern of rule.regexPatterns) {
			try {
				let regex: RegExp;

				// Use Discord-specific patterns from Sapphire utilities
				switch (regexPattern) {
					case 'discord-invite':
						regex = DiscordInviteLinkRegex;
						break;
					case 'user-mention':
						regex = UserOrMemberMentionRegex;
						break;
					case 'custom-emoji':
						regex = EmojiRegex;
						break;
					case 'message-link':
						regex = MessageLinkRegex;
						break;
					case 'webhook':
						regex = WebhookRegex;
						break;
					default:
						// Handle multiline patterns and case insensitive matching
						const flags = 'im'; // case insensitive and multiline
						regex = new RegExp(regexPattern, flags);
				}

				if (regex.test(content)) {
					matches.push({
						matchedRule: rule.name,
						matchedRuleId: ruleId,
						matchType: 'regex',
						matchedPattern: regexPattern
					});
				}
			} catch (error) {
				console.warn(`Invalid regex pattern: ${regexPattern}`, error);
			}
		}

		return {
			isAllowed: false,
			matches
		};
	}

	/**
	 * Check if content matches a pattern (supports wildcards with *)
	 */
	private matchesPattern(content: string, pattern: string): boolean {
		// Handle exact matches first
		if (pattern === content) {
			return true;
		}

		// Special handling for Discord mentions and other patterns with special chars
		if (pattern.includes('<@') || pattern.includes('discord.gg') || pattern.includes('http')) {
			// For Discord mentions and URLs, use simple contains check
			return content.toLowerCase().includes(pattern.toLowerCase());
		}

		// Handle patterns with wildcards
		if (pattern.includes('*')) {
			// Convert wildcard pattern to regex
			const regexPattern = pattern
				.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
				.replace(/\\\*/g, '.*'); // Convert * to .*

			try {
				// Use word boundaries for normal words, but not for special patterns
				const hasSpecialChars = /[<>@#\.\-\/\\]/.test(pattern);
				const regex = hasSpecialChars ? new RegExp(regexPattern, 'i') : new RegExp(`\\b${regexPattern}\\b`, 'i');
				return regex.test(content);
			} catch (error) {
				console.warn(`Invalid wildcard pattern: ${pattern}`, error);
				return false;
			}
		}

		// Check if content contains the pattern - use word boundaries for normal words only
		const hasSpecialChars = /[<>@#\.\-\/\\]/.test(pattern);
		if (hasSpecialChars) {
			// For patterns with special characters, use simple contains
			return content.toLowerCase().includes(pattern.toLowerCase());
		} else {
			// For normal words, use word boundaries
			const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
			return regex.test(content);
		}
	}

	/**
	 * Get all available rules
	 */
	public getRules(): Record<string, AutomodRule> {
		return this.rules.rules;
	}

	/**
	 * Get a specific rule by ID
	 */
	public getRule(ruleId: string): AutomodRule | undefined {
		return this.rules.rules[ruleId];
	}

	/**
	 * Get rule names mapped by their IDs
	 */
	public getRuleNames(): Record<string, string> {
		const names: Record<string, string> = {};
		for (const [ruleId, rule] of Object.entries(this.rules.rules)) {
			names[ruleId] = rule.name;
		}
		return names;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		automodRuleChecker: AutomodRuleChecker;
	}
}
