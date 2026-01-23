// Guild AI topic settings service - Manages AI-generated conversation topics for guilds
import type { GuildAITopicSettings, PrismaClient } from '@prisma/client';
import { createSubsystemLogger } from '../lib/subsystemLogger';

/**
 * Service for managing AI-generated conversation topics
 * - Create AI topic records with metadata
 * - Approve/reject topics
 * - List topics with filtering
 * - Track topic generation history
 */
export class GuildAITopicSettingsService {
	private readonly logger = createSubsystemLogger('GuildAITopicSettingsService');

	public constructor(private readonly database: PrismaClient) { }

	// ============================================================
	// Topic Management
	// ============================================================

	/**
	 * Creates a new AI topic record
	 *
	 * @param guildId Guild ID
	 * @param value Topic text content
	 * @param userPrompt Optional user prompt/theme
	 * @returns Created AI topic record
	 */
	public async createAITopic(guildId: string, value: string, userPrompt: string | null = null): Promise<GuildAITopicSettings> {
		const created = await this.database.guildAITopicSettings.create({
			data: {
				guildId,
				value,
				userPrompt,
				approved: null,
				reviewedBy: null,
				reviewedAt: null
			}
		});

		this.logger.info('AI topic created', { guildId, topicId: created.id, hasPrompt: !!userPrompt });
		return created;
	}

	/**
	 * Approves an AI topic and optionally adds it to the regular topics
	 *
	 * @param topicId AI topic ID
	 * @param reviewerId User ID who approved
	 * @returns Updated AI topic record
	 */
	public async approveTopic(topicId: number, reviewerId: string): Promise<GuildAITopicSettings> {
		const updated = await this.database.guildAITopicSettings.update({
			where: { id: topicId },
			data: {
				approved: true,
				reviewedBy: reviewerId,
				reviewedAt: new Date()
			}
		});

		this.logger.info('AI topic approved', { topicId, reviewerId });
		return updated;
	}

	/**
	 * Rejects an AI topic
	 *
	 * @param topicId AI topic ID
	 * @param reviewerId User ID who rejected
	 * @returns Updated AI topic record
	 */
	public async rejectTopic(topicId: number, reviewerId: string): Promise<GuildAITopicSettings> {
		const updated = await this.database.guildAITopicSettings.update({
			where: { id: topicId },
			data: {
				approved: false,
				reviewedBy: reviewerId,
				reviewedAt: new Date()
			}
		});

		this.logger.info('AI topic rejected', { topicId, reviewerId });
		return updated;
	}

	// ============================================================
	// Queries
	// ============================================================

	/**
	 * Lists all AI topics for a guild with optional filtering
	 *
	 * @param guildId Guild ID
	 * @param approved Optional filter by approval status
	 * @returns Array of AI topic records
	 */
	public async listAITopics(guildId: string, approved?: boolean): Promise<GuildAITopicSettings[]> {
		return this.database.guildAITopicSettings.findMany({
			where: {
				guildId,
				...(approved !== undefined && { approved })
			},
			orderBy: { createdAt: 'desc' }
		});
	}

	/**
	 * Gets approved AI topics (for history checking)
	 *
	 * @param guildId Guild ID
	 * @returns Array of approved topic values
	 */
	public async getApprovedTopicValues(guildId: string): Promise<string[]> {
		const topics = await this.database.guildAITopicSettings.findMany({
			where: {
				guildId,
				approved: true
			},
			select: { value: true },
			orderBy: { createdAt: 'desc' }
		});

		return topics.map((t) => t.value);
	}

	/**
	 * Gets rejected AI topics (for history checking)
	 *
	 * @param guildId Guild ID
	 * @returns Array of rejected topic values
	 */
	public async getRejectedTopicValues(guildId: string): Promise<string[]> {
		const topics = await this.database.guildAITopicSettings.findMany({
			where: {
				guildId,
				approved: false
			},
			select: { value: true },
			orderBy: { createdAt: 'desc' }
		});

		return topics.map((t) => t.value);
	}

	/**
	 * Gets statistics about AI topics for a guild
	 *
	 * @param guildId Guild ID
	 * @returns Statistics object
	 */
	public async getTopicStats(guildId: string): Promise<{ total: number; approved: number; rejected: number; pending: number }> {
		const [total, approved, rejected, pending] = await Promise.all([
			this.database.guildAITopicSettings.count({ where: { guildId } }),
			this.database.guildAITopicSettings.count({ where: { guildId, approved: true } }),
			this.database.guildAITopicSettings.count({ where: { guildId, approved: false } }),
			this.database.guildAITopicSettings.count({ where: { guildId, approved: null } })
		]);

		return { total, approved, rejected, pending };
	}
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
	interface Container {
		guildAITopicSettingsService: GuildAITopicSettingsService;
	}
}
