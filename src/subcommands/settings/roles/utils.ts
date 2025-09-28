// utils module within subcommands/settings/roles
import type { Args } from '@sapphire/framework';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { createErrorTextComponent, createTextComponent } from '../../../lib/components.js';
import type { RoleBucketKey as RoleBucketKeyBase } from '../../../services/guildRoleSettingsService';
export type RoleBucketKey = RoleBucketKeyBase;

export type RoleMutationContext = {
	command: RoleCommand;
	guildId: string | null;
	bucket: RoleBucketKey;
	roleId: string;
	operation: 'add' | 'remove';
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	respondComponents?: (components: any[]) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export type RoleListContext = {
	command: RoleCommand;
	guildId: string | null;
	bucket: RoleBucketKey | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	respondComponents?: (components: any[]) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export type RoleCommand = Subcommand;
export type RoleChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export const ROLE_BUCKETS = [
	{ key: 'allowedAdminRoles', label: 'Allowed Admin Roles' },
	{ key: 'allowedFunCommandRoles', label: 'Allowed Fun Command Roles' },
	{ key: 'allowedStaffRoles', label: 'Allowed Staff Roles' },
	{ key: 'allowedTagAdminRoles', label: 'Allowed Tag Admin Roles' },
	{ key: 'allowedTagRoles', label: 'Allowed Tag Roles' },
	{ key: 'ignoredSnipedRoles', label: 'Ignored Sniped Roles' },
	{ key: 'supportRoles', label: 'Support Roles' }
] as const satisfies ReadonlyArray<{ key: RoleBucketKey; label: string }>;

export const bucketLookup = new Map<string, RoleBucketKey>(
	ROLE_BUCKETS.flatMap((bucket) => [bucket.key, bucket.label].map((value) => [value.toLowerCase(), bucket.key]))
);

export const registerRoleSubcommandGroup = (group: SlashCommandSubcommandGroupBuilder) =>
	group
		.setName('roles')
		.setDescription('Configure server role allow lists.')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('add')
				.setDescription('Add a role to one of the configured lists.')
				.addStringOption((option) =>
					option
						.setName('setting')
						.setDescription('Which list to update.')
						.setRequired(true)
						.addChoices(...ROLE_BUCKETS.map((bucket) => ({ name: bucket.label, value: bucket.key })))
				)
				.addRoleOption((option) =>
					option
						.setName('role')
						.setDescription('Role to add to the list.')
						.setRequired(true)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('remove')
				.setDescription('Remove a role from one of the configured lists.')
				.addStringOption((option) =>
					option
						.setName('setting')
						.setDescription('Which list to update.')
						.setRequired(true)
						.addChoices(...ROLE_BUCKETS.map((bucket) => ({ name: bucket.label, value: bucket.key })))
				)
				.addRoleOption((option) =>
					option
						.setName('role')
						.setDescription('Role to remove from the list.')
						.setRequired(true)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('list')
				.setDescription('Show the roles configured in a list, or all lists.')
				.addStringOption((option) =>
					option
						.setName('setting')
						.setDescription('Which list to view (optional).')
						.setRequired(false)
						.addChoices(...ROLE_BUCKETS.map((bucket) => ({ name: bucket.label, value: bucket.key })))
				)
		);

export function formatError(error: unknown) {
	if (error instanceof Error) return error.message;
	return 'An unexpected error occurred.';
}

export async function parseBucket(args: Args, required: boolean): Promise<RoleBucketKey | null> {
	const result = await args.pickResult('string');

	if (result.isErr()) {
		if (required) {
			throw new Error(
				`You must provide a role setting. Available options: ${ROLE_BUCKETS.map((b) => b.key).join(', ')}`
			);
		}
		return null;
	}

	const value = result.unwrap();
	const resolved = bucketLookup.get(value.toLowerCase());

	if (!resolved) {
		throw new Error(`Unknown role setting "${value}". Try one of: ${ROLE_BUCKETS.map((b) => b.key).join(', ')}`);
	}

	return resolved;
}

export function parseBucketChoice(value: string | null, fallback: RoleBucketKey): RoleBucketKey {
	if (!value) return fallback;
	const resolved = bucketLookup.get(value.toLowerCase());
	if (!resolved) {
		throw new Error(`Unknown role setting "${value}". Try one of: ${ROLE_BUCKETS.map((b) => b.key).join(', ')}`);
	}
	return resolved;
}

export async function executeRoleMutation({
	command,
	guildId,
	bucket,
	roleId,
	operation,
	deny,
	respond,
	respondComponents,
	defer
}: RoleMutationContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const service = command.container.guildRoleSettingsService;
	if (!service) {
		return respondWithComponent(respond, respondComponents, 'Role settings are not available right now.', true);
	}
	const label = bucketLabel(bucket);

	if (operation === 'add') {
		const { added } = await service.addRole(guildId, bucket, roleId);
		if (!added) {
			return respondWithComponent(respond, respondComponents, `That role is already part of **${label}**.`, true);
		}

		return respondWithComponent(respond, respondComponents, `Added <@&${roleId}> to **${label}**.`);
	} else {
		const { removed } = await service.removeRole(guildId, bucket, roleId);
		if (!removed) {
			return respondWithComponent(respond, respondComponents, `That role is not configured for **${label}**.`, true);
		}

		return respondWithComponent(respond, respondComponents, `Removed <@&${roleId}> from **${label}**.`);
	}
}

export async function executeRoleList({
	command,
	guildId,
	bucket,
	deny,
	respond,
	respondComponents,
	defer
}: RoleListContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const service = command.container.guildRoleSettingsService;
	if (!service) {
		return respondWithComponent(respond, respondComponents, 'Role settings are not available right now.', true);
	}
	const buckets = bucket ? [bucket] : ROLE_BUCKETS.map((entry) => entry.key);
	const allBuckets = await service.getAllBuckets(guildId);

	// If we have component support, use it
	if (respondComponents) {
		const { createListComponent, createMultiSectionComponent } = await import('../../../lib/components.js');

		if (bucket) {
			// Single bucket - use simple list component
			const roles = allBuckets[bucket];
			const label = bucketLabel(bucket);
			const items = roles.length === 0 ? [] : roles.map((id) => `<@&${id}>`);
			const component = createListComponent(label, items, 'No roles configured yet.', false); // Role mentions are short, use commas
			return respondComponents([component]);
		} else {
			// Multiple buckets - use multi-section component with proper sections and separators
			const sections = buckets.map((key) => {
				const roles = allBuckets[key];
				const label = bucketLabel(key);
				const items = roles.length === 0 ? ['*(none)*'] : roles.map((id) => `<@&${id}>`);
				return {
					title: label,
					items,
					emptyMessage: '*(none)*',
					forceNewlines: false // Role mentions are short, use commas
				};
			});
			const component = createMultiSectionComponent(sections);
			if (component) {
				return respondComponents([component]);
			}
			// Fallback to plain text if the component would exceed Discord limits
		}
	}

	// Fallback to plain text for message commands
	const lines = buckets.map((key) => {
		const roles = allBuckets[key];
		const label = bucketLabel(key);

		if (roles.length === 0) {
			return `**${label}:** *(none)*`;
		}

		return `**${label}:** ${roles.map((id) => `<@&${id}>`).join(', ')}`;
	});

	return respondWithComponent(respond, respondComponents, lines.join('\n'));
}

export function bucketLabel(bucket: RoleBucketKey) {
	return ROLE_BUCKETS.find((entry) => entry.key === bucket)?.label ?? bucket;
}


export const denyInteraction = (interaction: RoleChatInputInteraction, content: string) =>
	interaction.reply({
		components: [createErrorTextComponent(content)],
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
		allowedMentions: { users: [], roles: [] }
	});

function respondWithComponent(
	respond: (content: string) => Promise<unknown>,
	respondComponents: RoleMutationContext['respondComponents'],
	content: string,
	isError: boolean = false
) {
	if (respondComponents) {
		const component = isError ? createErrorTextComponent(content) : createTextComponent(content);
		return respondComponents([component]);
	}

	return respond(content);
}
