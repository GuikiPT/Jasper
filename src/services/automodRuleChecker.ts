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

export interface AutomodCheckResult {
	isBlocked: boolean;
	matchedRule?: string;
	matchedRuleId?: string;
	matchType?: 'word' | 'regex';
	matchedPattern?: string;
	isAllowed?: boolean;
	allowedPattern?: string;
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
		for (const [ruleId, rule] of Object.entries(this.rules.rules)) {
			const result = this.checkAgainstRule(content, rule, ruleId);
			if (result.isBlocked) {
				return result;
			}
		}

		return { isBlocked: false };
	}

	/**
	 * Check content against a specific rule
	 */
	private checkAgainstRule(content: string, rule: AutomodRule, ruleId: string): AutomodCheckResult {
		const lowerContent = content.toLowerCase();

		// First check if content is explicitly allowed
		for (const allowedPattern of rule.allowedWords) {
			if (this.matchesPattern(lowerContent, allowedPattern.toLowerCase())) {
				return {
					isBlocked: false,
					matchedRule: rule.name,
					matchedRuleId: ruleId,
					isAllowed: true,
					allowedPattern: allowedPattern
				};
			}
		}

		// Check blocked words (with wildcard support)
		for (const blockedWord of rule.blockedWords) {
			if (this.matchesPattern(lowerContent, blockedWord.toLowerCase())) {
				return {
					isBlocked: true,
					matchedRule: rule.name,
					matchedRuleId: ruleId,
					matchType: 'word',
					matchedPattern: blockedWord
				};
			}
		}

		// Check regex patterns
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
					return {
						isBlocked: true,
						matchedRule: rule.name,
						matchedRuleId: ruleId,
						matchType: 'regex',
						matchedPattern: regexPattern
					};
				}
			} catch (error) {
				console.warn(`Invalid regex pattern: ${regexPattern}`, error);
			}
		}

		return { isBlocked: false };
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
