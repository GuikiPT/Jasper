// youtube-permissions module within subcommands/settings/youtube
import type {
	GuildBasedChannel,
	GuildMember,
	PermissionsBitField
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { UserResolvable } from 'discord.js';

// Ordered list of permissions required for YouTube tracking features
const REQUIRED_PERMISSION_BITS = [
	PermissionFlagsBits.ViewChannel,
	PermissionFlagsBits.ManageChannels
] as const;

// Human-friendly labels for the permission names we surface to users
const PERMISSION_LABELS = new Map<bigint, string>([
	[PermissionFlagsBits.ViewChannel, 'View Channel'],
	[PermissionFlagsBits.ManageChannels, 'Manage Channels']
]);

type PermissionSource = PermissionsBitField | Readonly<PermissionsBitField> | null | undefined;

type PermissionNameList = string[];

function resolveMissingPermissionNames(source: PermissionSource): PermissionNameList {
	const missing: PermissionNameList = [];

	for (const permission of REQUIRED_PERMISSION_BITS) {
		const hasMethod = source && typeof (source as PermissionsBitField).has === 'function';
		const hasPermission = hasMethod && (source as PermissionsBitField).has(permission);

		if (!hasPermission) {
			missing.push(PERMISSION_LABELS.get(permission) ?? `Unknown (${permission.toString()})`);
		}
	}

	return missing;
}

export function getMissingPermissionNames(source: PermissionSource): PermissionNameList {
	return resolveMissingPermissionNames(source);
}

export function getMissingPermissionNamesForChannel(
	channel: GuildBasedChannel | null | undefined,
	target: GuildMember | UserResolvable | null | undefined
): PermissionNameList {
	if (!channel || !target) {
		return resolveMissingPermissionNames(null);
	}

	const permissions = channel.permissionsFor(target);

	return resolveMissingPermissionNames(permissions);
}

export function mergePermissionNameLists(...lists: PermissionNameList[]): PermissionNameList {
	const unique = new Set<string>();

	for (const list of lists) {
		for (const permission of list) {
			unique.add(permission);
		}
	}

	return Array.from(unique);
}

export const REQUIRED_PERMISSION_NAMES = Array.from(PERMISSION_LABELS.values());
