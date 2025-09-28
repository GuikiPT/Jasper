// guildTopicSettingsService module within services
import type { GuildTopicSettings, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export class TopicAlreadyExistsError extends Error {
	public constructor(message = 'Topic already exists.') {
		super(message);
		this.name = 'TopicAlreadyExistsError';
	}
}

export class GuildTopicSettingsService {
	public constructor(private readonly database: PrismaClient) {}

	public async addTopic(guildId: string, value: string): Promise<GuildTopicSettings> {
		try {
			return await this.database.guildTopicSettings.create({
				data: { guildId, value }
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new TopicAlreadyExistsError();
			}
			throw error;
		}
	}

	public async removeTopic(guildId: string, topicId: number): Promise<GuildTopicSettings | null> {
		const topic = await this.database.guildTopicSettings.findFirst({
			where: { id: topicId, guildId }
		});
		if (!topic) {
			return null;
		}

		await this.database.guildTopicSettings.delete({ where: { id: topicId } });
		return topic;
	}

	public async listTopics(guildId: string): Promise<GuildTopicSettings[]> {
		return this.database.guildTopicSettings.findMany({
			where: { guildId },
			orderBy: { id: 'asc' }
		});
	}

	public async getRandomTopic(guildId: string): Promise<GuildTopicSettings | null> {
		const total = await this.database.guildTopicSettings.count({ where: { guildId } });
		if (total === 0) {
			return null;
		}

		const skip = Math.floor(Math.random() * total);
		return this.database.guildTopicSettings.findFirst({
			where: { guildId },
			skip,
			take: 1
		});
	}

	public async exportTopics(guildId: string): Promise<GuildTopicSettings[]> {
		return this.database.guildTopicSettings.findMany({
			where: { guildId },
			orderBy: { id: 'asc' }
		});
	}

	public async importTopics(
		guildId: string,
		topics: readonly string[]
	): Promise<number> {
		if (topics.length === 0) return 0;

		const payload = topics.map((value) => ({ guildId, value }));
		const result = await this.database.guildTopicSettings.createMany({
			data: payload,
			skipDuplicates: true
		});

		return result.count;
	}

	public async fetchTopicsForPagination(guildId: string, take: number, skip: number) {
		return this.database.guildTopicSettings.findMany({
			where: { guildId },
			orderBy: { id: 'asc' },
			skip,
			take
		});
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		guildTopicSettingsService: GuildTopicSettingsService;
	}
}
