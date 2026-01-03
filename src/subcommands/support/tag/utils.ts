// Tag utilities - shared helpers for tag subcommands
import type { Subcommand } from '@sapphire/plugin-subcommands';
import type { APIInteractionGuildMember, GuildMember } from 'discord.js';
import {
	EmbedBuilder,
	MessageFlags,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder
} from 'discord.js';
import type { GuildSupportTagSettings } from '@prisma/client';
import { GuildSupportTagTableMissingError, type NormalizedImportEntry as SupportTagNormalizedImportEntry } from '../../../services/supportTagService';
import { createSubsystemLogger } from '../../../lib/subsystemLogger';

const logger = createSubsystemLogger('SupportTagCommands');

// Type aliases
export type TagCommand = Subcommand;
export type TagChatInputInteraction = Subcommand.ChatInputCommandInteraction;

// Field length limits
export const MAX_TAG_NAME_LENGTH = 64;
export const MAX_EMBED_TITLE_LENGTH = 512;
export const MAX_EMBED_DESCRIPTION_LENGTH = 65_535; // TEXT field limit in MySQL
export const MAX_EMBED_FOOTER_LENGTH = 65_535; // TEXT field limit in MySQL

// ============================================================
// Reply Helpers
// ============================================================

// Send ephemeral reply with text content
export const replyEphemeral = (interaction: TagChatInputInteraction, content: string) => {
	const components = [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))];

	return interaction.reply({
		components,
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
	});
};

// Send reply with text content (ephemeral or public)
export const replyWithComponents = (interaction: TagChatInputInteraction, content: string, ephemeral: boolean = false) => {
	const components = [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))];

	const flags = ephemeral ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 : MessageFlags.IsComponentsV2;

	return interaction.reply({
		components,
		flags
	});
};

// ============================================================
// Type Definitions
// ============================================================

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

// ============================================================
// Tag Embed Builders
// ============================================================

// Process escape sequences in tag content (e.g., \n to actual newlines)
const processTagContent = (content: string): string => {
	return content.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
};

// Build legacy embed format for tag (deprecated)
export const buildTagEmbed = (tag: GuildSupportTagSettings) => {
	const embed = new EmbedBuilder().setTitle(tag.embedTitle).setColor(0x5865f2);

	if (tag.embedDescription) {
		embed.setDescription(processTagContent(tag.embedDescription));
	}

	if (tag.embedFooter) {
		embed.setFooter({ text: processTagContent(tag.embedFooter) });
	}

	if (tag.embedImageUrl) {
		embed.setImage(tag.embedImageUrl);
	}

	return embed;
};

// Build modern component format for tag display
export const buildTagComponents = (tag: GuildSupportTagSettings, user?: { id: string }) => {
	const components = [];

	// Add user mention as separate component outside container if provided
	if (user) {
		components.push(new TextDisplayBuilder().setContent(`<@${user.id}>`));
	}

	// Create the main container for the tag content
	const container = new ContainerBuilder();

	// Always start with the title
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${tag.embedTitle}`));

	// Add separator after title
	container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

	// Add body (description) if present
	if (tag.embedDescription) {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(processTagContent(tag.embedDescription)));

		// Add separator after body
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
	}

	// Add image if present
	if (tag.embedImageUrl) {
		container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(tag.embedImageUrl)));

		// Add separator after image
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
	}

	// Add footer if present
	if (tag.embedFooter) {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(processTagContent(tag.embedFooter)));
	}

	// Add the container to components
	components.push(container);

	return components;
};

// ============================================================
// Error Handling
// ============================================================

export const SUPPORT_TAG_TABLE_MISSING_MESSAGE =
	'Support tag storage has not been initialised yet. Run the pending Prisma migration to create the `GuildSupportTagSettings` table.';

export const isSupportTagTableMissingError = (error: unknown): error is GuildSupportTagTableMissingError =>
	error instanceof GuildSupportTagTableMissingError;

export const isSupportTagPrismaTableMissingError = (error: unknown): error is GuildSupportTagTableMissingError =>
	isSupportTagTableMissingError(error);

// ============================================================
// Tag Operations
// ============================================================

// Find tag by name in guild
export const findTag = async (command: TagCommand, guildId: string, name: string) => {
	const service = command.container.supportTagService;
	if (!service) {
		logger.error('Support tag service unavailable');
		throw new Error('Support tag service is not initialised.');
	}

	return service.findTagByName(guildId, name);
};

// ============================================================
// Channel Access Control
// ============================================================

// Fetch allowed tag channels for guild
export const fetchAllowedTagChannels = async (context: ContainerAccessor, guildId: string) => {
	const service = context.container.guildChannelSettingsService;
	if (!service) {
		logger.error('Channel settings service unavailable', { guildId });
		return [];
	}

	try {
		return await service.listBucket(guildId, 'allowedTagChannels');
	} catch (error) {
		logger.error('Failed to load allowed tag channels', error, { guildId });
		return [];
	}
};

// Collect candidate channel IDs (current channel and parent if thread)
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

// Check if interaction is in an allowed tag channel
export const ensureTagChannelAccess = async (context: ContainerAccessor, interaction: ChannelAwareInteraction): Promise<TagChannelAccess> => {
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

	return allowed ? { allowed: true, allowedChannels } : { allowed: false, allowedChannels, reason: 'not-allowed' };
};

type RestrictionCopy = {
	unconfigured: string;
	single: (channel: string) => string;
	multiple: (channels: string) => string;
};

// Format channel restriction error message
export const formatTagChannelRestrictionMessage = (access: RestrictedTagChannelAccess, copy: RestrictionCopy) => {
	if (access.reason === 'unconfigured') {
		return copy.unconfigured;
	}

	const formatted = access.allowedChannels.map((id) => `<#${id}>`).join(', ');
	return access.allowedChannels.length === 1 ? copy.single(formatted) : copy.multiple(formatted);
};

// ============================================================
// Role Access Control
// ============================================================

// Fetch support roles for guild
const fetchSupportRoles = async (context: ContainerAccessor, guildId: string) => {
	const service = context.container.guildRoleSettingsService;
	if (!service) {
		logger.error('Role settings service unavailable', { guildId });
		return [];
	}

	try {
		return await service.listBucket(guildId, 'supportRoles');
	} catch (error) {
		logger.error('Failed to load support roles', error, { guildId });
		return [];
	}
};

// Fetch allowed tag roles for guild
const fetchAllowedTagRoles = async (context: ContainerAccessor, guildId: string) => {
	const service = context.container.guildRoleSettingsService;
	if (!service) {
		logger.error('Role settings service unavailable', { guildId });
		return [];
	}

	try {
		return await service.listBucket(guildId, 'allowedTagRoles');
	} catch (error) {
		logger.error('Failed to load allowed tag roles', error, { guildId });
		return [];
	}
};

// Fetch allowed tag admin roles for guild
const fetchAllowedTagAdminRoles = async (context: ContainerAccessor, guildId: string) => {
	const service = context.container.guildRoleSettingsService;
	if (!service) {
		logger.error('Role settings service unavailable', { guildId });
		return [];
	}

	try {
		return await service.listBucket(guildId, 'allowedTagAdminRoles');
	} catch (error) {
		logger.error('Failed to load allowed tag admin roles', error, { guildId });
		return [];
	}
};

// Check if member has any of the allowed roles
const memberHasAllowedRole = (member: GuildMember | APIInteractionGuildMember, allowedRoles: readonly string[]) => {
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

type SupportRoleAccess = { allowed: true } | { allowed: false; reason: 'missing-member' | 'no-config' | 'forbidden' };

export const SUPPORT_ROLE_REQUIRED_MESSAGE = 'You need a support role to use this command.';

// Check if member has support role access
export const ensureSupportRoleAccess = async (context: ContainerAccessor, interaction: SupportRoleAwareInteraction): Promise<SupportRoleAccess> => {
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

type AllowedTagRoleAccess = { allowed: true } | { allowed: false; reason: 'missing-member' | 'no-config' | 'forbidden' };

type AllowedTagAdminRoleAccess = { allowed: true } | { allowed: false; reason: 'missing-member' | 'no-config' | 'forbidden' };

// Check if member has tag role or admin role access
export const ensureAllowedTagRoleAccess = async (
	context: ContainerAccessor,
	interaction: SupportRoleAwareInteraction
): Promise<AllowedTagRoleAccess> => {
	const { guildId, member } = interaction;
	if (!guildId || !member) {
		return { allowed: false, reason: 'missing-member' };
	}

	const [allowedRoles, allowedAdminRoles] = await Promise.all([
		fetchAllowedTagRoles(context, guildId),
		fetchAllowedTagAdminRoles(context, guildId)
	]);

	if (allowedRoles.length === 0 && allowedAdminRoles.length === 0) {
		return { allowed: false, reason: 'no-config' };
	}

	if (allowedRoles.length > 0 && memberHasAllowedRole(member, allowedRoles)) {
		return { allowed: true };
	}

	if (allowedAdminRoles.length > 0 && memberHasAllowedRole(member, allowedAdminRoles)) {
		return { allowed: true };
	}

	return { allowed: false, reason: 'forbidden' };
};

// Check if member has tag admin role access
export const ensureAllowedTagAdminRoleAccess = async (
	context: ContainerAccessor,
	interaction: SupportRoleAwareInteraction
): Promise<AllowedTagAdminRoleAccess> => {
	const { guildId, member } = interaction;
	if (!guildId || !member) {
		return { allowed: false, reason: 'missing-member' };
	}

	const allowedAdminRoles = await fetchAllowedTagAdminRoles(context, guildId);
	if (allowedAdminRoles.length === 0) {
		return { allowed: false, reason: 'no-config' };
	}

	if (!memberHasAllowedRole(member, allowedAdminRoles)) {
		return { allowed: false, reason: 'forbidden' };
	}

	return { allowed: true };
};

// ============================================================
// Validation Helpers
// ============================================================

// Normalize tag name to lowercase trimmed format
export const normalizeTagName = (name: string) => name.trim().toLowerCase();

// Validate tag name format (alphanumeric, dash, underscore)
export const validateName = (name: string) => /^[\w-]+$/u.test(name);

// Validate URL format
export const validateUrl = (value: string) => {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch (error) {
		return false;
	}
};

// Format date as Discord relative timestamp
export const timestamp = (date: Date) => `<t:${Math.floor(date.getTime() / 1_000)}:R>`;

// Normalize optional string field (null if empty)
export const normalizeOptional = (value: string | null) => {
	if (value === null) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

// ============================================================
// Import Validation
// ============================================================

// Normalize and validate import entry
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
		return {
			ok: false,
			reason: `Embed title for "${nameRaw}" exceeds ${MAX_EMBED_TITLE_LENGTH} characters (${titleRaw.length} chars). Consider shortening it.`
		};
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
	const imageRaw =
		(typeof candidate.imageUrl === 'string' ? candidate.imageUrl.trim() : null) ||
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

export type NormalizedImportEntry = SupportTagNormalizedImportEntry;

export type NormalizedImportResult = { ok: true; value: NormalizedImportEntry } | { ok: false; reason: string };
