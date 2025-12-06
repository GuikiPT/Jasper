// Guild topic settings service - Manages conversation topics for guilds
import type { GuildTopicSettings, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ============================================================
// Custom Errors
// ============================================================

/**
 * Error thrown when attempting to add a duplicate topic
 */
export class TopicAlreadyExistsError extends Error {
    public constructor(message = 'Topic already exists.') {
        super(message);
        this.name = 'TopicAlreadyExistsError';
    }
}

/**
 * Service for managing conversation topics
 * - Add/remove individual topics
 * - List topics with ordering
 * - Get random topics for conversation starters
 * - Import/export topics in bulk
 * - Paginated topic fetching
 */
export class GuildTopicSettingsService {
    public constructor(private readonly database: PrismaClient) {}

    // ============================================================
    // Topic Management
    // ============================================================

    /**
     * Adds a new topic to a guild
     * - Prevents duplicates via database constraint
     * 
     * @param guildId Guild ID
     * @param value Topic text content
     * @returns Created topic record
     * @throws {TopicAlreadyExistsError} If topic already exists for guild
     */
    public async addTopic(guildId: string, value: string): Promise<GuildTopicSettings> {
        try {
            return await this.database.guildTopicSettings.create({
                data: { guildId, value }
            });
        } catch (error) {
            // Handle unique constraint violation (duplicate topic)
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new TopicAlreadyExistsError();
            }
            throw error;
        }
    }

    /**
     * Removes a topic from a guild
     * - Verifies topic belongs to guild before deletion
     * 
     * @param guildId Guild ID
     * @param topicId Topic ID to remove
     * @returns Deleted topic or null if not found
     */
    public async removeTopic(guildId: string, topicId: number): Promise<GuildTopicSettings | null> {
        // Verify topic exists and belongs to guild
        const topic = await this.database.guildTopicSettings.findFirst({
            where: { id: topicId, guildId }
        });
        if (!topic) {
            return null;
        }

        await this.database.guildTopicSettings.delete({ where: { id: topicId } });
        return topic;
    }

    /**
     * Lists all topics for a guild
     * - Ordered by ID (creation order)
     * 
     * @param guildId Guild ID
     * @returns Array of topic records
     */
    public async listTopics(guildId: string): Promise<GuildTopicSettings[]> {
        return this.database.guildTopicSettings.findMany({
            where: { guildId },
            orderBy: { id: 'asc' }
        });
    }

    // ============================================================
    // Random Topic Selection
    // ============================================================

    /**
     * Gets a random topic for a guild
     * - Uses database skip for randomization
     * - Returns null if no topics exist
     * 
     * @param guildId Guild ID
     * @returns Random topic or null
     */
    public async getRandomTopic(guildId: string): Promise<GuildTopicSettings | null> {
        const total = await this.database.guildTopicSettings.count({ where: { guildId } });
        if (total === 0) {
            return null;
        }

        // Random skip position
        const skip = Math.floor(Math.random() * total);
        return this.database.guildTopicSettings.findFirst({
            where: { guildId },
            skip,
            take: 1
        });
    }

    // ============================================================
    // Import/Export
    // ============================================================

    /**
     * Exports all topics for a guild
     * - Ordered by ID for consistent export
     * 
     * @param guildId Guild ID
     * @returns Array of all topic records
     */
    public async exportTopics(guildId: string): Promise<GuildTopicSettings[]> {
        return this.database.guildTopicSettings.findMany({
            where: { guildId },
            orderBy: { id: 'asc' }
        });
    }

    /**
     * Imports topics in bulk for a guild
     * - Skips duplicates automatically
     * - Returns count of newly created topics
     * 
     * @param guildId Guild ID
     * @param topics Array of topic text values to import
     * @returns Number of topics successfully created
     */
    public async importTopics(guildId: string, topics: readonly string[]): Promise<number> {
        if (topics.length === 0) return 0;

        const payload = topics.map((value) => ({ guildId, value }));
        const result = await this.database.guildTopicSettings.createMany({
            data: payload,
            skipDuplicates: true
        });

        return result.count;
    }

    // ============================================================
    // Pagination
    // ============================================================

    /**
     * Fetches topics with pagination support
     * - Ordered by ID for consistent pagination
     * 
     * @param guildId Guild ID
     * @param take Number of topics to fetch
     * @param skip Number of topics to skip
     * @returns Array of topic records for the page
     */
    public async fetchTopicsForPagination(guildId: string, take: number, skip: number) {
        return this.database.guildTopicSettings.findMany({
            where: { guildId },
            orderBy: { id: 'asc' },
            skip,
            take
        });
    }
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
    interface Container {
        guildTopicSettingsService: GuildTopicSettingsService;
    }
}
