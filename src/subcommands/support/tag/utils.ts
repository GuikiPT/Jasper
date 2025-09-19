import type { Subcommand } from '@sapphire/plugin-subcommands';
import type { APIInteractionGuildMember, GuildMember } from 'discord.js';
import { EmbedBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { Prisma, type GuildSupportTag } from '@prisma/client';

export type TagCommand = Subcommand;
export type TagChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export const MAX_TAG_NAME_LENGTH = 64;
export const MAX_EMBED_TITLE_LENGTH = 512;
export const MAX_EMBED_DESCRIPTION_LENGTH = 65_535; // TEXT field limit in MySQL
export const MAX_EMBED_FOOTER_LENGTH = 65_535; // TEXT field limit in MySQL

export const replyEphemeral = (interaction: TagChatInputInteraction, content: string) => {
	const components = [
		new ContainerBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(content)
			)
	];

	return interaction.reply({
		components,
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
	});
};

export const replyWithComponents = (interaction: TagChatInputInteraction, content: string, ephemeral: boolean = false) => {
	const components = [
		new ContainerBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(content)
			)
	];

	const flags = ephemeral
		? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		: MessageFlags.IsComponentsV2;

	return interaction.reply({
		components,
		flags
	});
};

type ContainerAccessor = { container: TagCommand['container'] };

type ChannelAwareInteraction = {
	guildId: string | null;
	channelId: string | null;
	channel: unknown;
};

type SupportRoleAwareInteraction = {
	guildId: string | null;
	member: GuildMember | APIInteractionGuildMember | null;
};

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

export const buildTagComponents = (tag: GuildSupportTag, user?: { id: string }) => {
	const components = [];

	// Add user mention as separate component outside container if provided
	if (user) {
		components.push(
			new TextDisplayBuilder().setContent(`<@${user.id}>`)
		);
	}

	// Create the main container for the tag content
	const container = new ContainerBuilder();

	// Always start with the title
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`# ${tag.embedTitle}`)
	);

	// Add separator after title
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
	);

	// Add body (description) if present
	if (tag.embedDescription) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(tag.embedDescription)
		);

		// Add separator after body
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);
	}

	// Add image if present
	if (tag.embedImageUrl) {
		container.addMediaGalleryComponents(
			new MediaGalleryBuilder()
				.addItems(
					new MediaGalleryItemBuilder()
						.setURL(tag.embedImageUrl)
				)
		);

		// Add separator after image
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);
	}

	// Add footer if present (should always have separator before footer when footer exists)
	if (tag.embedFooter) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(tag.embedFooter)
		);
	}

	// Add the container to components
	components.push(container);

	return components;
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

export const fetchAllowedTagChannels = async (context: ContainerAccessor, guildId: string) => {
	const settings = await context.container.database.guildChannelSettings.findUnique({
		where: { guildId },
		select: { allowedTagChannels: true }
	});

	return toStringArray(settings?.allowedTagChannels);
};

const collectCandidateChannelIds = (interaction: ChannelAwareInteraction) => {
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

type RestrictedTagChannelAccess = Extract<TagChannelAccess, { allowed: false }>;

export const ensureTagChannelAccess = async (
	context: ContainerAccessor,
	interaction: ChannelAwareInteraction
): Promise<TagChannelAccess> => {
	const guildId = interaction.guildId;
	if (!guildId) {
		return { allowed: false, allowedChannels: [], reason: 'unconfigured' };
	}

	const allowedChannels = await fetchAllowedTagChannels(context, guildId);
	if (allowedChannels.length === 0) {
		return { allowed: false, allowedChannels, reason: 'unconfigured' };
	}

	const candidateChannels = collectCandidateChannelIds(interaction);
	const allowed = allowedChannels.some((channelId) => candidateChannels.has(channelId));

	return allowed
		? { allowed: true, allowedChannels }
		: { allowed: false, allowedChannels, reason: 'not-allowed' };
};

type RestrictionCopy = {
	unconfigured: string;
	single: (channel: string) => string;
	multiple: (channels: string) => string;
};

export const formatTagChannelRestrictionMessage = (
	access: RestrictedTagChannelAccess,
	copy: RestrictionCopy
) => {
	if (access.reason === 'unconfigured') {
		return copy.unconfigured;
	}

	const formatted = access.allowedChannels.map((id) => `<#${id}>`).join(', ');
	return access.allowedChannels.length === 1 ? copy.single(formatted) : copy.multiple(formatted);
};

const fetchSupportRoles = async (context: ContainerAccessor, guildId: string) => {
	const settings = await context.container.database.guildRoleSettings.findUnique({
		where: { guildId },
		select: { supportRoles: true }
	});

	return toStringArray(settings?.supportRoles);
};

const fetchAllowedTagRoles = async (context: ContainerAccessor, guildId: string) => {
	const settings = await context.container.database.guildRoleSettings.findUnique({
		where: { guildId },
		select: { allowedTagRoles: true }
	});

	return toStringArray(settings?.allowedTagRoles);
};

const memberHasAllowedRole = (
	member: GuildMember | APIInteractionGuildMember,
	allowedRoles: readonly string[]
) => {
	if ('roles' in member) {
		const roles = member.roles;
		if (Array.isArray(roles)) {
			return roles.some((roleId) => allowedRoles.includes(roleId));
		}
	}

	if ((member as GuildMember).roles?.cache) {
		return allowedRoles.some((roleId) => (member as GuildMember).roles.cache.has(roleId));
	}

	return false;
};

type SupportRoleAccess =
	| { allowed: true }
	| { allowed: false; reason: 'missing-member' | 'no-config' | 'forbidden' };

export const SUPPORT_ROLE_REQUIRED_MESSAGE = 'You need a support role to use this command.';

export const ensureSupportRoleAccess = async (
	context: ContainerAccessor,
	interaction: SupportRoleAwareInteraction
): Promise<SupportRoleAccess> => {
	const { guildId, member } = interaction;
	if (!guildId || !member) {
		return { allowed: false, reason: 'missing-member' };
	}

	const allowedRoles = await fetchSupportRoles(context, guildId);
	if (allowedRoles.length === 0) {
		return { allowed: false, reason: 'no-config' };
	}

	if (!memberHasAllowedRole(member, allowedRoles)) {
		return { allowed: false, reason: 'forbidden' };
	}

	return { allowed: true };
};

type AllowedTagRoleAccess =
	| { allowed: true }
	| { allowed: false; reason: 'missing-member' | 'forbidden' };

export const ALLOWED_TAG_ROLE_REQUIRED_MESSAGE = 'You need an allowed tag role to use this command.';

export const ensureAllowedTagRoleAccess = async (
	context: ContainerAccessor,
	interaction: SupportRoleAwareInteraction
): Promise<AllowedTagRoleAccess> => {
	const { guildId, member } = interaction;
	if (!guildId || !member) {
		return { allowed: false, reason: 'missing-member' };
	}

	const allowedRoles = await fetchAllowedTagRoles(context, guildId);
	if (allowedRoles.length === 0) {
		return { allowed: true };
	}

	if (!memberHasAllowedRole(member, allowedRoles)) {
		return { allowed: false, reason: 'forbidden' };
	}

	return { allowed: true };
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

export const normalizeImportEntry = (raw: unknown, tagName?: string): NormalizedImportResult => {
	if (typeof raw !== 'object' || raw === null) {
		return { ok: false, reason: 'Entry is not an object.' };
	}

	const candidate = raw as Record<string, unknown>;

	// Handle both formats: array format with explicit name field, or object format where name is the key
	const nameRaw = tagName || (typeof candidate.name === 'string' ? candidate.name.trim() : null);
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
		return { ok: false, reason: `Embed title for "${nameRaw}" exceeds ${MAX_EMBED_TITLE_LENGTH} characters (${titleRaw.length} chars). Consider shortening it.` };
	}

	const descriptionRaw = typeof candidate.description === 'string' ? candidate.description.trim() : null;
	if (descriptionRaw && descriptionRaw.length > MAX_EMBED_DESCRIPTION_LENGTH) {
		return { ok: false, reason: `Embed description for "${nameRaw}" is too long.` };
	}

	const footerRaw = typeof candidate.footer === 'string' ? candidate.footer.trim() : null;
	if (footerRaw && footerRaw.length > MAX_EMBED_FOOTER_LENGTH) {
		return { ok: false, reason: `Embed footer for "${nameRaw}" is too long.` };
	}

	// Handle both 'image' and 'imageUrl' properties for compatibility
	const imageRaw = (typeof candidate.imageUrl === 'string' ? candidate.imageUrl.trim() : null) ||
		(typeof candidate.image === 'string' ? candidate.image.trim() : null);
	if (imageRaw && !validateUrl(imageRaw)) {
		return { ok: false, reason: `Embed image URL for "${nameRaw}" is invalid.` };
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
