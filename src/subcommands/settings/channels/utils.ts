// Utilities for channel allowlist settings (snipe, tags, slowmode)
import type { Args } from '@sapphire/framework';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import type { ChannelBucketKey as ChannelBucketKeyBase } from '../../../services/guildChannelSettingsService';
import { createSubsystemLogger } from '../../../lib/subsystemLogger';

const logger = createSubsystemLogger('SettingsChannels');

export type ChannelBucketKey = ChannelBucketKeyBase;
export type ChannelCommand = Subcommand;
export type ChannelChatInputInteraction = Subcommand.ChatInputCommandInteraction;

// Context for add/remove operations
export type ChannelMutationContext = {
	command: ChannelCommand;
	guildId: string | null;
	bucket: ChannelBucketKey;
	channelId: string;
	operation: 'add' | 'remove';
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

// Context for list operations
export type ChannelListContext = {
	command: ChannelCommand;
	guildId: string | null;
	bucket: ChannelBucketKey | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	respondComponents?: (components: any[]) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

// Available channel bucket configurations
export const CHANNEL_BUCKETS = [
	{ key: 'allowedSnipeChannels', label: 'Allowed Snipe Channels' },
	{ key: 'allowedTagChannels', label: 'Allowed Tag Channels' },
	{ key: 'automaticSlowmodeChannels', label: 'Automatic Slowmode Channels' }
] as const satisfies ReadonlyArray<{ key: ChannelBucketKey; label: string }>;

// Map for resolving bucket keys from user input (case-insensitive)
export const bucketLookup = new Map<string, ChannelBucketKey>(
	CHANNEL_BUCKETS.flatMap((bucket) => [bucket.key, bucket.label].map((value) => [value.toLowerCase(), bucket.key]))
);

// Register Discord slash command structure for channels group
export const registerChannelSubcommandGroup = (group: SlashCommandSubcommandGroupBuilder) =>
	group
		.setName('channels')
		.setDescription('Configure server channel allow lists.')
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Add a channel to one of the configured lists.')
				.addStringOption((option) =>
					option
						.setName('setting')
						.setDescription('Which list to update.')
						.setRequired(true)
						.addChoices(...CHANNEL_BUCKETS.map((b) => ({ name: b.label, value: b.key })))
				)
				.addChannelOption((option) => option.setName('channel').setDescription('Channel to add to the list.').setRequired(true))
		)
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Remove a channel from one of the configured lists.')
				.addStringOption((option) =>
					option
						.setName('setting')
						.setDescription('Which list to update.')
						.setRequired(true)
						.addChoices(...CHANNEL_BUCKETS.map((b) => ({ name: b.label, value: b.key })))
				)
				.addChannelOption((option) => option.setName('channel').setDescription('Channel to remove from the list.').setRequired(true))
		)
		.addSubcommand((sub) =>
			sub
				.setName('list')
				.setDescription('Show the channels configured in a list, or all lists.')
				.addStringOption((option) =>
					option
						.setName('setting')
						.setDescription('Which list to view (optional).')
						.setRequired(false)
						.addChoices(...CHANNEL_BUCKETS.map((b) => ({ name: b.label, value: b.key })))
				)
		);

// Format error messages for user display
export function formatError(error: unknown) {
	if (error instanceof Error) return error.message;
	return 'An unexpected error occurred.';
}

// Parse bucket key from message command arguments
export async function parseBucket(args: Args, required: boolean): Promise<ChannelBucketKey | null> {
	const result = await args.pickResult('string');

	if (result.isErr()) {
		if (required) {
			throw new Error(`You must provide a channel setting. Available options: ${CHANNEL_BUCKETS.map((b) => b.key).join(', ')}`);
		}
		return null;
	}

	const value = result.unwrap();
	const resolved = bucketLookup.get(value.toLowerCase());
	if (!resolved) {
		throw new Error(`Unknown channel setting "${value}". Try one of: ${CHANNEL_BUCKETS.map((b) => b.key).join(', ')}`);
	}
	return resolved;
}

// Parse bucket key from slash command choice
export function parseBucketChoice(value: string | null, fallback: ChannelBucketKey): ChannelBucketKey {
	if (!value) return fallback;
	const resolved = bucketLookup.get(value.toLowerCase());
	if (!resolved) {
		throw new Error(`Unknown channel setting "${value}". Try one of: ${CHANNEL_BUCKETS.map((b) => b.key).join(', ')}`);
	}
	return resolved;
}

// Execute add or remove operation on a channel bucket
export async function executeChannelMutation({ command, guildId, bucket, channelId, operation, deny, respond, defer }: ChannelMutationContext) {
	// Validate guild context
	if (!guildId) {
		logger.warn('Channel mutation denied (no guild)', { bucket, channelId, operation });
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	// Get channel settings service
	const service = command.container.guildChannelSettingsService;
	if (!service) {
		logger.error('Channel settings service unavailable', { guildId });
		return respond('Channel settings are not available right now.');
	}
	const label = bucketLabel(bucket);

	// Perform operation
	if (operation === 'add') {
		const { added } = await service.addChannel(guildId, bucket, channelId);
		if (!added) {
			logger.info('Channel already present in bucket', { guildId, bucket, channelId });
			return respond(`That channel is already part of **${label}**.`);
		}

		logger.info('Channel added to bucket', { guildId, bucket, channelId });
	} else {
		const { removed } = await service.removeChannel(guildId, bucket, channelId);
		if (!removed) {
			logger.info('Channel not present in bucket', { guildId, bucket, channelId });
			return respond(`That channel is not configured for **${label}**.`);
		}

		logger.info('Channel removed from bucket', { guildId, bucket, channelId });
	}

	return respond(operation === 'add' ? `Added <#${channelId}> to **${label}**.` : `Removed <#${channelId}> from **${label}**.`);
}

// List channels in one or all buckets
export async function executeChannelList({ command, guildId, bucket, deny, respond, respondComponents, defer }: ChannelListContext) {
	// Validate guild context
	if (!guildId) {
		logger.warn('Channel list denied (no guild)', { bucket });
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	// Get channel settings service
	const service = command.container.guildChannelSettingsService;
	if (!service) {
		logger.error('Channel settings service unavailable for list', { guildId });
		return respond('Channel settings are not available right now.');
	}

	// Determine which buckets to list
	const buckets = bucket ? [bucket] : CHANNEL_BUCKETS.map((entry) => entry.key);
	const allBuckets = await service.getAllBuckets(guildId);
	logger.debug('Channel buckets listed', {
		guildId,
		bucket,
		counts: buckets.reduce<Record<string, number>>((acc, key) => {
			acc[key] = allBuckets[key].length;
			return acc;
		}, {})
	});

	// Use Discord Components v2 for slash commands if available
	if (respondComponents) {
		const { createListComponent, createMultiSectionComponent } = await import('../../../lib/components.js');

		if (bucket) {
			// Single bucket - use simple list component
			const chans = allBuckets[bucket];
			const label = bucketLabel(bucket);
			const items = chans.length === 0 ? [] : chans.map((id) => `<#${id}>`);
			const component = createListComponent(label, items, 'No channels configured yet.', false);
			return respondComponents([component]);
		} else {
			// Multiple buckets - use multi-section component
			const sections = buckets.map((key) => {
				const chans = allBuckets[key];
				const label = bucketLabel(key);
				const items = chans.length === 0 ? ['*(none)*'] : chans.map((id) => `<#${id}>`);
				return {
					title: label,
					items,
					emptyMessage: '*(none)*',
					forceNewlines: false // Channel mentions are short, use commas
				};
			});

			const component = createMultiSectionComponent(sections);
			if (component) {
				return respondComponents([component]);
			}
			// Fallback to plain text if component would exceed Discord limits
		}
	}

	// Fallback to plain text for message commands
	const lines = buckets.map((key) => {
		const chans = allBuckets[key];
		const label = bucketLabel(key);
		if (chans.length === 0) return `**${label}:** *(none)*`;
		return `**${label}:** ${chans.map((id) => `<#${id}>`).join(', ')}`;
	});

	return respond(lines.join('\n'));
}

// Get human-readable label for a bucket key
export function bucketLabel(bucket: ChannelBucketKey) {
	return CHANNEL_BUCKETS.find((entry) => entry.key === bucket)?.label ?? bucket;
}

// Send ephemeral denial message for slash commands
export const denyInteraction = (interaction: ChannelChatInputInteraction, content: string) =>
	interaction.reply({ content, flags: MessageFlags.Ephemeral });
