// Tag subcommand group - exports and type definitions
// Re-export types
export type { NormalizedImportEntry, NormalizedImportResult, TagChatInputInteraction, TagCommand } from './utils';

// Re-export constants
export { MAX_EMBED_DESCRIPTION_LENGTH, MAX_EMBED_FOOTER_LENGTH, MAX_EMBED_TITLE_LENGTH, MAX_TAG_NAME_LENGTH } from './utils';

// Re-export subcommand handlers
export { chatInputTagCreate } from './tag-create';
export { chatInputTagDelete } from './tag-delete';
export { chatInputTagEdit } from './tag-edit';
export { chatInputTagExport } from './tag-export';
export { chatInputTagImport } from './tag-import';
export { chatInputTagInfo } from './tag-info';
export { chatInputTagList } from './tag-list';
export { chatInputTagRaw } from './tag-raw';
export { chatInputTagShow } from './tag-show';
export { chatInputTagUse } from './tag-use';

// Re-export utility functions
export {
	buildTagEmbed,
	buildTagComponents,
	ensureAllowedTagAdminRoleAccess,
	ensureAllowedTagRoleAccess,
	ensureSupportRoleAccess,
	ensureTagChannelAccess,
	formatTagChannelRestrictionMessage,
	fetchAllowedTagChannels,
	findTag,
	normalizeImportEntry,
	normalizeOptional,
	normalizeTagName,
	replyEphemeral,
	replyWithComponents,
	SUPPORT_ROLE_REQUIRED_MESSAGE,
	timestamp,
	validateName,
	validateUrl
} from './utils';
