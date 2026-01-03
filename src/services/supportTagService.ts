// Support tag service - Manages support tags (pre-formatted response templates)
import type { GuildSupportTagSettings, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createSubsystemLogger } from '../lib/subsystemLogger';

// ============================================================
// Type Definitions
// ============================================================

export type TransactionClient = Prisma.TransactionClient;

/**
 * Normalized tag data for import operations
 */
export type NormalizedImportEntry = {
	name: string;
	title: string;
	description?: string;
	footer?: string;
	image?: string;
	authorId?: string;
	editedBy?: string;
};

/**
 * Summary of import operation results
 */
export interface SupportTagImportSummary {
	created: number;
	updated: number;
}

// ============================================================
// Custom Errors
// ============================================================

/**
 * Error thrown when attempting to create/update tag with duplicate name
 */
export class SupportTagDuplicateNameError extends Error {
	public constructor(message = 'A tag with that name already exists.') {
		super(message);
		this.name = 'SupportTagDuplicateNameError';
	}
}

/**
 * Error thrown when database table is missing (migration not run)
 */
export class GuildSupportTagTableMissingError extends Error {
	public constructor(cause?: unknown) {
		super('Support tag storage has not been initialised yet. Run the pending Prisma migration to create the `GuildSupportTagSettings` table.');
		this.name = 'GuildSupportTagTableMissingError';
		if (cause instanceof Error) {
			this.cause = cause;
		}
	}
}

// ============================================================
// Error Detection Helpers
// ============================================================

/**
 * Checks if error is a missing table error (P2021)
 */
const isTableMissingError = (error: unknown): error is Prisma.PrismaClientKnownRequestError =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

/**
 * Checks if error is a duplicate key error (P2002)
 */
const isDuplicateError = (error: unknown): error is Prisma.PrismaClientKnownRequestError =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Service for managing support tags
 * - Create/read/update/delete tags
 * - Search and pagination
 * - Bulk import/export
 * - Tags are pre-formatted embed templates for common responses
 * - Supports name-based lookup for quick access
 */
export class SupportTagService {
	private readonly logger = createSubsystemLogger('SupportTagService');

	public constructor(private readonly database: PrismaClient) {}

	// ============================================================
	// Tag Retrieval
	// ============================================================

	/**
	 * Finds a tag by name in a guild
	 * - Case-sensitive lookup
	 *
	 * @param guildId Guild ID
	 * @param name Tag name
	 * @returns Tag or null if not found
	 */
	public async findTagByName(guildId: string, name: string) {
		try {
			const tag = await this.database.guildSupportTagSettings.findFirst({
				where: { guildId, name }
			});
			if (tag) {
				this.logger.debug('Tag fetched by name', { guildId, name, tagId: tag.id });
			}
			return tag;
		} catch (error) {
			throw this.transformError(error);
		}
	}

	/**
	 * Finds a tag by ID
	 *
	 * @param id Tag ID
	 * @returns Tag or null if not found
	 */
	public async findTagById(id: number) {
		try {
			const tag = await this.database.guildSupportTagSettings.findUnique({ where: { id } });
			if (tag) {
				this.logger.debug('Tag fetched by id', { tagId: id, guildId: tag.guildId });
			}
			return tag;
		} catch (error) {
			throw this.transformError(error);
		}
	}

	/**
	 * Lists all tags for a guild
	 * - Sorted alphabetically by name
	 *
	 * @param guildId Guild ID
	 * @returns Array of all tags
	 */
	public async listTags(guildId: string) {
		try {
			const tags = await this.database.guildSupportTagSettings.findMany({
				where: { guildId },
				orderBy: { name: 'asc' }
			});
			this.logger.debug('Listed all tags', { guildId, count: tags.length });
			return tags;
		} catch (error) {
			throw this.transformError(error);
		}
	}

	/**
	 * Retrieves tags with pagination
	 * - Sorted alphabetically by name
	 *
	 * @param guildId Guild ID
	 * @param skip Number of tags to skip
	 * @param take Number of tags to fetch
	 * @returns Array of tags for the page
	 */
	public async paginateTags(guildId: string, skip: number, take: number) {
		try {
			const tags = await this.database.guildSupportTagSettings.findMany({
				where: { guildId },
				orderBy: { name: 'asc' },
				skip,
				take
			});
			this.logger.debug('Paginated tags fetched', { guildId, skip, take, count: tags.length });
			return tags;
		} catch (error) {
			throw this.transformError(error);
		}
	}

	/**
	 * Searches tags by name substring
	 * - Case-insensitive search
	 * - Returns up to limit results
	 *
	 * @param guildId Guild ID
	 * @param query Search query
	 * @param limit Maximum results to return
	 * @returns Array of matching tags
	 */
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

	// ============================================================
	// Tag Modification
	// ============================================================

	/**
	 * Creates a new tag
	 * - Validates name uniqueness within guild
	 *
	 * @param guildId Guild ID
	 * @param data Tag data
	 * @returns Created tag
	 * @throws {SupportTagDuplicateNameError} If name already exists
	 */
	public async createTag(guildId: string, data: Omit<GuildSupportTagSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'> & { name: string }) {
		try {
			const created = await this.database.guildSupportTagSettings.create({
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

			this.logger.info('Support tag created', {
				guildId,
				tagId: created.id,
				name: data.name,
				authorId: data.authorId
			});

			return created;
		} catch (error) {
			if (isDuplicateError(error)) {
				this.logger.warn('Support tag creation blocked due to duplicate name', error, { guildId, name: data.name });
				throw new SupportTagDuplicateNameError();
			}
			throw this.transformError(error);
		}
	}

	/**
	 * Updates an existing tag
	 * - Updates only provided fields
	 * - Validates name uniqueness if name is changed
	 *
	 * @param tagId Tag ID
	 * @param data Partial tag data to update
	 * @returns Updated tag
	 * @throws {SupportTagDuplicateNameError} If new name conflicts
	 */
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
			const updated = await this.database.guildSupportTagSettings.update({
				where: { id: tagId },
				data
			});

			this.logger.info('Support tag updated', {
				tagId,
				name: data.name,
				embedTitle: data.embedTitle,
				guildId: updated.guildId
			});

			return updated;
		} catch (error) {
			if (isDuplicateError(error)) {
				this.logger.warn('Support tag update blocked due to duplicate name', error, { tagId, name: data.name });
				throw new SupportTagDuplicateNameError();
			}
			throw this.transformError(error);
		}
	}

	/**
	 * Deletes a tag by ID
	 *
	 * @param tagId Tag ID
	 */
	public async deleteTag(tagId: number): Promise<void> {
		try {
			await this.database.guildSupportTagSettings.delete({ where: { id: tagId } });
			this.logger.info('Support tag deleted', { tagId });
		} catch (error) {
			throw this.transformError(error);
		}
	}

	/**
	 * Deletes all tags for a guild
	 *
	 * @param guildId Guild ID
	 * @returns Number of tags deleted
	 */
	public async deleteAllTags(guildId: string): Promise<number> {
		try {
			const result = await this.database.guildSupportTagSettings.deleteMany({ where: { guildId } });
			this.logger.info('Deleted all support tags for guild', { guildId, count: result.count });
			return result.count;
		} catch (error) {
			throw this.transformError(error);
		}
	}

	// ============================================================
	// Bulk Operations
	// ============================================================

	/**
	 * Imports tags in bulk
	 * - Optionally overwrites existing tags
	 * - Creates new tags or updates existing ones
	 * - Runs in transaction for atomicity
	 *
	 * @param guildId Guild ID
	 * @param entries Array of normalized tag entries
	 * @param options Import options (overwrite, actorId)
	 * @returns Summary with created/updated counts
	 */
	public async importTags(
		guildId: string,
		entries: readonly NormalizedImportEntry[],
		options: { overwrite: boolean; actorId: string }
	): Promise<SupportTagImportSummary> {
		let created = 0;
		let updated = 0;

		try {
			await this.database.$transaction(async (tx) => {
				// Delete all existing tags if overwrite enabled
				if (options.overwrite) {
					await tx.guildSupportTagSettings.deleteMany({ where: { guildId } });
				}

				// Process each import entry
				for (const entry of entries) {
					const existing = options.overwrite
						? null
						: await tx.guildSupportTagSettings.findFirst({
								where: { guildId, name: entry.name }
							});

					// Create new tag if doesn't exist
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

					// Update existing tag
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

			this.logger.info('Support tags imported', {
				guildId,
				overwrite: options.overwrite,
				requested: entries.length,
				created,
				updated,
				actorId: options.actorId
			});

			return { created, updated };
		} catch (error) {
			throw this.transformError(error);
		}
	}

	// ============================================================
	// Error Handling
	// ============================================================

	/**
	 * Transforms database errors into application-specific errors
	 * - Converts table missing errors
	 * - Preserves other errors
	 */
	private transformError(error: unknown): Error {
		if (isTableMissingError(error)) {
			return new GuildSupportTagTableMissingError(error);
		}

		return error instanceof Error ? error : new Error('Unknown support tag error');
	}
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
	interface Container {
		supportTagService: SupportTagService;
	}
}
