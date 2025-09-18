import type { Subcommand } from '@sapphire/plugin-subcommands';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { Prisma, type GuildSupportTag } from '@prisma/client';

export type TagCommand = Subcommand;
export type TagChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export const MAX_TAG_NAME_LENGTH = 64;
export const MAX_EMBED_TITLE_LENGTH = 256;
export const MAX_EMBED_DESCRIPTION_LENGTH = 4_096;
export const MAX_EMBED_FOOTER_LENGTH = 2_048;

export const replyEphemeral = (interaction: TagChatInputInteraction, content: string) =>
	interaction.reply({ content, flags: MessageFlags.Ephemeral });

export const buildTagEmbed = (tag: GuildSupportTag) => {
	const embed = new EmbedBuilder().setTitle(tag.embedTitle).setColor(0x5865f2);

	if (tag.embedDescription) {
		embed.setDescription(tag.embedDescription);
	}

	if (tag.embedFooter) {
		embed.setFooter({ text: tag.embedFooter });
	}

	if (tag.embedImageUrl) {
		embed.setImage(tag.embedImageUrl);
	}

	return embed;
};

export class GuildSupportTagTableMissingError extends Error {
	public constructor(cause?: unknown) {
		super(SUPPORT_TAG_TABLE_MISSING_MESSAGE);
		this.name = 'GuildSupportTagTableMissingError';
		if (cause instanceof Error) {
			this.cause = cause;
		}
	}
}

const isPrismaTableMissingError = (error: unknown): error is Prisma.PrismaClientKnownRequestError =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

export const isSupportTagPrismaTableMissingError = (error: unknown): error is Prisma.PrismaClientKnownRequestError =>
	isPrismaTableMissingError(error);

export const SUPPORT_TAG_TABLE_MISSING_MESSAGE =
	'Support tag storage has not been initialised yet. Run the pending Prisma migration to create the `GuildSupportTag` table.';

export const isSupportTagTableMissingError = (error: unknown): error is GuildSupportTagTableMissingError =>
	error instanceof GuildSupportTagTableMissingError;

export const findTag = async (command: TagCommand, guildId: string, name: string) => {
	try {
		return await command.container.database.guildSupportTag.findFirst({
			where: {
				guildId,
				name
			}
		});
	} catch (error) {
		if (isPrismaTableMissingError(error)) {
			throw new GuildSupportTagTableMissingError(error);
		}
		throw error;
	}
};

const toStringArray = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

export const fetchAllowedTagChannels = async (command: TagCommand, guildId: string) => {
	const settings = await command.container.database.guildChannelSettings.findUnique({
		where: { guildId },
		select: { allowedTagChannels: true }
	});

	return toStringArray(settings?.allowedTagChannels);
};

const collectCandidateChannelIds = (interaction: TagChatInputInteraction) => {
	const candidates = new Set<string>();

	if (interaction.channelId) {
		candidates.add(interaction.channelId);
	}

	const channel = interaction.channel as { parentId?: unknown } | null | undefined;
	const parentId = channel && typeof channel === 'object' && typeof channel.parentId === 'string' ? channel.parentId : null;
	if (parentId) {
		candidates.add(parentId);
	}

	return candidates;
};

type TagChannelAccess =
	| { allowed: true; allowedChannels: string[] }
	| { allowed: false; allowedChannels: string[]; reason: 'unconfigured' | 'not-allowed' };

export const ensureTagChannelAccess = async (
	command: TagCommand,
	interaction: TagChatInputInteraction
): Promise<TagChannelAccess> => {
	const guildId = interaction.guildId;
	if (!guildId) {
		return { allowed: false, allowedChannels: [], reason: 'unconfigured' };
	}

	const allowedChannels = await fetchAllowedTagChannels(command, guildId);
	if (allowedChannels.length === 0) {
		return { allowed: false, allowedChannels, reason: 'unconfigured' };
	}

	const candidateChannels = collectCandidateChannelIds(interaction);
	const allowed = allowedChannels.some((channelId) => candidateChannels.has(channelId));

	return allowed
		? { allowed: true, allowedChannels }
		: { allowed: false, allowedChannels, reason: 'not-allowed' };
};

export const normalizeTagName = (name: string) => name.trim().toLowerCase();

export const validateName = (name: string) => /^[\w-]+$/u.test(name);

export const validateUrl = (value: string) => {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch (error) {
		return false;
	}
};

export const timestamp = (date: Date) => `<t:${Math.floor(date.getTime() / 1_000)}:R>`;

export const normalizeOptional = (value: string | null) => {
	if (value === null) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

export const normalizeImportEntry = (raw: unknown): NormalizedImportResult => {
	if (typeof raw !== 'object' || raw === null) {
		return { ok: false, reason: 'Entry is not an object.' };
	}

	const candidate = raw as Record<string, unknown>;
	const nameRaw = typeof candidate.name === 'string' ? candidate.name.trim() : null;
	const titleRaw = typeof candidate.title === 'string' ? candidate.title.trim() : null;

	if (!nameRaw || !titleRaw) {
		return { ok: false, reason: 'Entries must include both "name" and "title".' };
	}

	const name = normalizeTagName(nameRaw);

	if (!validateName(name)) {
		return { ok: false, reason: `Invalid tag name "${nameRaw}".` };
	}

	if (titleRaw.length === 0) {
		return { ok: false, reason: 'Embed title cannot be empty.' };
	}

	if (titleRaw.length > MAX_EMBED_TITLE_LENGTH) {
		return { ok: false, reason: `Embed title exceeds ${MAX_EMBED_TITLE_LENGTH} characters.` };
	}

	const descriptionRaw = typeof candidate.description === 'string' ? candidate.description.trim() : null;
	if (descriptionRaw && descriptionRaw.length > MAX_EMBED_DESCRIPTION_LENGTH) {
		return { ok: false, reason: 'Embed description is too long.' };
	}

	const footerRaw = typeof candidate.footer === 'string' ? candidate.footer.trim() : null;
	if (footerRaw && footerRaw.length > MAX_EMBED_FOOTER_LENGTH) {
		return { ok: false, reason: 'Embed footer is too long.' };
	}

	const imageRaw = typeof candidate.image === 'string' ? candidate.image.trim() : null;
	if (imageRaw && !validateUrl(imageRaw)) {
		return { ok: false, reason: 'Embed image URL is invalid.' };
	}

	const authorId = typeof candidate.authorId === 'string' ? candidate.authorId : undefined;
	const editedBy = typeof candidate.editedBy === 'string' ? candidate.editedBy : undefined;

	return {
		ok: true,
		value: {
			name,
			title: titleRaw,
			description: descriptionRaw ?? undefined,
			footer: footerRaw ?? undefined,
			image: imageRaw ?? undefined,
			authorId,
			editedBy
		}
	};
};

export type NormalizedImportEntry = {
	name: string;
	title: string;
	description?: string;
	footer?: string;
	image?: string;
	authorId?: string;
	editedBy?: string;
};

export type NormalizedImportResult =
	| { ok: true; value: NormalizedImportEntry }
	| { ok: false; reason: string };

export type TransactionClient = Prisma.TransactionClient;
