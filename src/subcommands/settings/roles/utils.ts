import type { Args } from '@sapphire/framework';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import type { GuildRoleSettings } from '@prisma/client';

export type RoleMutationContext = {
	command: RoleCommand;
	guildId: string | null;
	bucket: RoleBucketKey;
	roleId: string;
	operation: 'add' | 'remove';
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
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
] as const;

export type RoleBucketKey = (typeof ROLE_BUCKETS)[number]['key'];

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
	defer
}: RoleMutationContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	let settings: GuildRoleSettings;
	try {
		settings = await ensureRoleSettings(command, guildId);
	} catch (error) {
		return respond('Failed to load role settings. Please try again later.');
	}
	const current = getStringArray(settings[bucket]);
	const label = bucketLabel(bucket);

	if (operation === 'add') {
		if (current.includes(roleId)) {
			return respond(`That role is already part of **${label}**.`);
		}

		current.push(roleId);
	} else {
		if (!current.includes(roleId)) {
			return respond(`That role is not configured for **${label}**.`);
		}

		removeInPlace(current, roleId);
	}

	try {
		await command.container.database.guildRoleSettings.upsert({
			where: { guildId },
			create: {
				...blankRoleSettings(guildId),
				[bucket]: JSON.stringify(current)
			},
			update: {
				[bucket]: JSON.stringify(current)
			}
		});
	} catch {
		return respond('Failed to update role settings. Please try again later.');
	}

	return respond(
		operation === 'add'
			? `Added <@&${roleId}> to **${label}**.`
			: `Removed <@&${roleId}> from **${label}**.`
	);
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

	let settings: GuildRoleSettings;
	try {
		settings = await ensureRoleSettings(command, guildId);
	} catch (error) {
		return respond('Failed to load role settings. Please try again later.');
	}
	const buckets = bucket ? [bucket] : ROLE_BUCKETS.map((entry) => entry.key);

	// If we have component support, use it
	if (respondComponents) {
		const { createListComponent, createMultiSectionComponent } = await import('../../../lib/components.js');

		if (bucket) {
			// Single bucket - use simple list component
			const roles = getStringArray(settings[bucket]);
			const label = bucketLabel(bucket);
			const items = roles.length === 0 ? [] : roles.map((id) => `<@&${id}>`);
			const component = createListComponent(label, items, 'No roles configured yet.', false); // Role mentions are short, use commas
			return respondComponents([component]);
		} else {
			// Multiple buckets - use multi-section component with proper sections and separators
			const sections = buckets.map((key) => {
				const roles = getStringArray(settings[key]);
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
		const roles = getStringArray(settings[key]);
		const label = bucketLabel(key);

		if (roles.length === 0) {
			return `**${label}:** *(none)*`;
		}

		return `**${label}:** ${roles.map((id) => `<@&${id}>`).join(', ')}`;
	});

	return respond(lines.join('\n'));
}

export async function ensureRoleSettings(command: RoleCommand, guildId: string): Promise<GuildRoleSettings> {
	const existing = await command.container.database.guildRoleSettings.findUnique({
		where: { guildId }
	});

	if (existing) return existing;

	// Ensure GuildSettings exists first (required for foreign key constraint)
	await command.container.database.guildSettings.upsert({
		where: { id: guildId },
		create: { id: guildId },
		update: {}
	});

	return command.container.database.guildRoleSettings.create({
		data: blankRoleSettings(guildId)
	});
}

export function blankRoleSettings(guildId: string) {
	return {
		guildId,
		allowedAdminRoles: JSON.stringify([]),
		allowedFunCommandRoles: JSON.stringify([]),
		allowedStaffRoles: JSON.stringify([]),
		allowedTagAdminRoles: JSON.stringify([]),
		allowedTagRoles: JSON.stringify([]),
		ignoredSnipedRoles: JSON.stringify([]),
		supportRoles: JSON.stringify([])
	};
}

export function getStringArray(value: string | null | undefined): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

export function bucketLabel(bucket: RoleBucketKey) {
	return ROLE_BUCKETS.find((entry) => entry.key === bucket)?.label ?? bucket;
}

export function removeInPlace(array: string[], value: string) {
	const index = array.indexOf(value);
	if (index !== -1) array.splice(index, 1);
}

export const denyInteraction = (interaction: RoleChatInputInteraction, content: string) =>
	interaction.reply({ content, flags: MessageFlags.Ephemeral });
