// supportTagService module within services
import type { GuildSupportTagSettings, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export type TransactionClient = Prisma.TransactionClient;

export type NormalizedImportEntry = {
	name: string;
	title: string;
	description?: string;
	footer?: string;
	image?: string;
	authorId?: string;
	editedBy?: string;
};

export class SupportTagDuplicateNameError extends Error {
	public constructor(message = 'A tag with that name already exists.') {
		super(message);
		this.name = 'SupportTagDuplicateNameError';
	}
}

export class GuildSupportTagTableMissingError extends Error {
	public constructor(cause?: unknown) {
		super('Support tag storage has not been initialised yet. Run the pending Prisma migration to create the `GuildSupportTagSettings` table.');
		this.name = 'GuildSupportTagTableMissingError';
		if (cause instanceof Error) {
			this.cause = cause;
		}
	}
}

export interface SupportTagImportSummary {
	created: number;
	updated: number;
}

const isTableMissingError = (error: unknown): error is Prisma.PrismaClientKnownRequestError =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

const isDuplicateError = (error: unknown): error is Prisma.PrismaClientKnownRequestError =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export class SupportTagService {
	public constructor(private readonly database: PrismaClient) {}

	public async findTagByName(guildId: string, name: string) {
		try {
			return await this.database.guildSupportTagSettings.findFirst({
				where: { guildId, name }
			});
		} catch (error) {
			throw this.transformError(error);
		}
	}

	public async findTagById(id: number) {
		try {
			return await this.database.guildSupportTagSettings.findUnique({ where: { id } });
		} catch (error) {
			throw this.transformError(error);
		}
	}

	public async listTags(guildId: string) {
		try {
			return await this.database.guildSupportTagSettings.findMany({
				where: { guildId },
				orderBy: { name: 'asc' }
			});
		} catch (error) {
			throw this.transformError(error);
		}
	}

	public async paginateTags(guildId: string, skip: number, take: number) {
		try {
			return await this.database.guildSupportTagSettings.findMany({
				where: { guildId },
				orderBy: { name: 'asc' },
				skip,
				take
			});
		} catch (error) {
			throw this.transformError(error);
		}
	}

	public async searchTags(guildId: string, query: string, limit: number) {
		try {
			const normalized = query.toLowerCase();
			const tags = await this.database.guildSupportTagSettings.findMany({
				where: { guildId },
				orderBy: { name: 'asc' }
			});
			return tags.filter((tag) => tag.name.toLowerCase().includes(normalized)).slice(0, Math.max(limit, 0));
		} catch (error) {
			throw this.transformError(error);
		}
	}

	public async createTag(guildId: string, data: Omit<GuildSupportTagSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'> & { name: string }) {
		try {
			return await this.database.guildSupportTagSettings.create({
				data: {
					guildId,
					name: data.name,
					authorId: data.authorId,
					editedBy: data.editedBy ?? null,
					embedTitle: data.embedTitle,
					embedDescription: data.embedDescription ?? null,
					embedFooter: data.embedFooter ?? null,
					embedImageUrl: data.embedImageUrl ?? null
				}
			});
		} catch (error) {
			if (isDuplicateError(error)) {
				throw new SupportTagDuplicateNameError();
			}
			throw this.transformError(error);
		}
	}

	public async updateTag(
		tagId: number,
		data: Partial<{
			name: string;
			embedTitle: string;
			embedDescription: string | null;
			embedFooter: string | null;
			embedImageUrl: string | null;
			editedBy: string | null;
		}>
	): Promise<GuildSupportTagSettings> {
		try {
			return await this.database.guildSupportTagSettings.update({
				where: { id: tagId },
				data
			});
		} catch (error) {
			if (isDuplicateError(error)) {
				throw new SupportTagDuplicateNameError();
			}
			throw this.transformError(error);
		}
	}

	public async deleteTag(tagId: number): Promise<void> {
		try {
			await this.database.guildSupportTagSettings.delete({ where: { id: tagId } });
		} catch (error) {
			throw this.transformError(error);
		}
	}

	public async deleteAllTags(guildId: string): Promise<number> {
		try {
			const result = await this.database.guildSupportTagSettings.deleteMany({ where: { guildId } });
			return result.count;
		} catch (error) {
			throw this.transformError(error);
		}
	}

	public async importTags(
		guildId: string,
		entries: readonly NormalizedImportEntry[],
		options: { overwrite: boolean; actorId: string }
	): Promise<SupportTagImportSummary> {
		let created = 0;
		let updated = 0;

		try {
			await this.database.$transaction(async (tx) => {
				if (options.overwrite) {
					await tx.guildSupportTagSettings.deleteMany({ where: { guildId } });
				}

				for (const entry of entries) {
					const existing = options.overwrite
						? null
						: await tx.guildSupportTagSettings.findFirst({
								where: { guildId, name: entry.name }
							});

					if (!existing) {
						await tx.guildSupportTagSettings.create({
							data: {
								guildId,
								name: entry.name,
								authorId: entry.authorId ?? options.actorId,
								editedBy: entry.editedBy ?? null,
								embedTitle: entry.title,
								embedDescription: entry.description ?? null,
								embedFooter: entry.footer ?? null,
								embedImageUrl: entry.image ?? null
							}
						});
						created += 1;
						continue;
					}

					await tx.guildSupportTagSettings.update({
						where: { id: existing.id },
						data: {
							name: entry.name,
							embedTitle: entry.title,
							embedDescription: entry.description ?? null,
							embedFooter: entry.footer ?? null,
							embedImageUrl: entry.image ?? null,
							editedBy: options.actorId
						}
					});
					updated += 1;
				}
			});

			return { created, updated };
		} catch (error) {
			throw this.transformError(error);
		}
	}

	private transformError(error: unknown): Error {
		if (isTableMissingError(error)) {
			return new GuildSupportTagTableMissingError(error);
		}

		return error instanceof Error ? error : new Error('Unknown support tag error');
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		supportTagService: SupportTagService;
	}
}
