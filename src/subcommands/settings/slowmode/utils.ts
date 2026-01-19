// utils module within subcommands/settings/slowmode
import type { GuildSlowmodeSettings } from '@prisma/client';
import type { Subcommand, SubcommandMappingGroup } from '@sapphire/plugin-subcommands';
import type { Args } from '@sapphire/framework';
import { MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { createSubsystemLogger } from '../../../lib/subsystemLogger';

const logger = createSubsystemLogger('SettingsSlowmode');

export type SlowmodeCommand = Subcommand;
export type SlowmodeChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export type SlowmodeViewContext = {
	command: SlowmodeCommand;
	guildId: string | null;
	respond: (content: string) => Promise<unknown>;
	respondComponents?: (components: any[]) => Promise<unknown>;
	deny: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export type SlowmodeUpdateContext = SlowmodeViewContext & {
	updates: SlowmodeUpdateInput;
};

export type SlowmodeUpdateInput = Partial<{
	enabled: boolean;
	messageThreshold: number;
	messageTimeWindow: number;
	cooldownDuration: number;
	resetTime: number;
	maxSlowmode: number;
}>;

const DISCORD_MAX_SLOWMODE = 21_600;

export const registerSlowmodeSubcommandGroup = (group: SlashCommandSubcommandGroupBuilder) =>
	group
		.setName('slowmode')
		.setDescription('Configure automatic slowmode behaviour.')
		.addSubcommand((sub) => sub.setName('view').setDescription('View the current slowmode configuration.'))
		.addSubcommand((sub) =>
			sub
				.setName('configure')
				.setDescription('Update slowmode settings for this server.')
				.addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable automatic slowmode.'))
				.addIntegerOption((option) =>
					option.setName('threshold').setDescription('Messages required within the time window before slowmode is applied.').setMinValue(1)
				)
				.addIntegerOption((option) =>
					option.setName('window').setDescription('Time window (in seconds) used to count message activity.').setMinValue(1)
				)
				.addIntegerOption((option) =>
					option.setName('cooldown').setDescription('Minimum seconds between slowmode adjustments.').setMinValue(1)
				)
				.addIntegerOption((option) =>
					option.setName('reset').setDescription('Seconds of inactivity before slowmode is reset to minimum (1 second).').setMinValue(1)
				)
				.addIntegerOption((option) =>
					option
						.setName('max')
						.setDescription('Maximum slowmode duration to apply (seconds).')
						.setMinValue(1)
						.setMaxValue(DISCORD_MAX_SLOWMODE)
				)
		);

export const slowmodeSubcommandMapping: SubcommandMappingGroup = {
	name: 'slowmode',
	type: 'group',
	entries: [
		{
			name: 'view',
			chatInputRun: 'chatInputSlowmodeView',
			messageRun: 'messageSlowmodeView',
			preconditions: ['AllowedAdminRoles']
		},
		{
			name: 'configure',
			chatInputRun: 'chatInputSlowmodeConfigure',
			messageRun: 'messageSlowmodeConfigure',
			preconditions: ['AllowedAdminRoles']
		}
	]
};

export async function executeSlowmodeView({ command, guildId, respond, respondComponents, deny, defer }: SlowmodeViewContext) {
	if (!guildId) {
		logger.warn('Slowmode view denied (no guild)');
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const slowmodeService = command.container.guildSlowmodeSettingsService;
	const channelService = command.container.guildChannelSettingsService;

	if (!slowmodeService || !channelService) {
		logger.error('Slowmode view services unavailable', {
			guildId,
			slowmodeService: Boolean(slowmodeService),
			channelService: Boolean(channelService)
		});
		return respond('Slowmode settings are not available right now.');
	}

	const settings = await slowmodeService.getOrCreateSettings(guildId);
	const trackedChannels = await channelService.listBucket(guildId, 'automaticSlowmodeChannels');

	// If we have component support, use it
	if (respondComponents) {
		try {
			logger.debug('Using component response for slowmode view', { guildId });
			const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = await import('discord.js');

			const container = new ContainerBuilder();

			const formatChannels = (channels: string[]) => (channels.length ? channels.map((id) => `<#${id}>`).join(', ') : '*(none)*');

			// General Settings section
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### General Settings'));
			container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

			const generalItems = [
				`**Enabled:** ${settings.enabled ? 'Yes' : 'No'}`,
				`**Message Threshold:** ${settings.messageThreshold} message${settings.messageThreshold === 1 ? '' : 's'}`,
				`**Activity Window:** ${settings.messageTimeWindow} second${settings.messageTimeWindow === 1 ? '' : 's'}`,
				`**Cooldown Between Adjustments:** ${settings.cooldownDuration} second${settings.cooldownDuration === 1 ? '' : 's'}`,
				`**Reset After Inactivity:** ${settings.resetTime} second${settings.resetTime === 1 ? '' : 's'}`,
				`**Maximum Slowmode:** ${settings.maxSlowmode} second${settings.maxSlowmode === 1 ? '' : 's'}`
			];

			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(generalItems.join('\n')));

			// Tracked Channels section
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Tracked Channels'));
			container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(formatChannels(trackedChannels)));

			logger.debug('Slowmode view component created', { guildId });
			return respondComponents([container]);
		} catch (error) {
			logger.error('Error creating slowmode view component', error, { guildId });
		}
	} else {
		logger.debug('Slowmode view using text response', { guildId });
	}

	// Fallback to plain text for message commands
	const lines = formatSlowmodeSettings(settings, { trackedChannels });

	return respond(lines);
}

export async function executeSlowmodeUpdate({ command, guildId, updates, respond, respondComponents, deny, defer }: SlowmodeUpdateContext) {
	if (!guildId) {
		logger.warn('Slowmode update denied (no guild)');
		return deny('This command can only be used inside a server.');
	}

	const sanitized = sanitizeUpdates(updates);
	if (!sanitized) {
		logger.debug('Slowmode update rejected (no valid fields)', { guildId });
		return deny('Provide at least one valid slowmode field to update.');
	}

	if (defer) {
		await defer();
	}

	const slowmodeService = command.container.guildSlowmodeSettingsService;
	const channelService = command.container.guildChannelSettingsService;

	if (!slowmodeService || !channelService) {
		logger.error('Slowmode update services unavailable', {
			guildId,
			slowmodeService: Boolean(slowmodeService),
			channelService: Boolean(channelService)
		});
		return respond('Slowmode settings are not available right now.');
	}

	let settings: GuildSlowmodeSettings;
	try {
		settings = await slowmodeService.getOrCreateSettings(guildId);
	} catch (error) {
		logger.error('Failed to ensure slowmode settings', error, { guildId });
		return respond('Something went wrong while loading slowmode settings. Please try again.');
	}

	const updatePayload = buildUpdatePayload(settings, sanitized);
	if (!updatePayload) {
		return respond('Slowmode settings already match the provided values.');
	}

	let updated: GuildSlowmodeSettings;
	try {
		updated = await slowmodeService.updateSettings(guildId, updatePayload);
	} catch (error) {
		logger.error('Failed to update slowmode settings', error, { guildId });
		return respond('Failed to update slowmode settings. Please try again later.');
	}

	logger.info('Updated automatic slowmode settings', {
		guildId,
		updates: updatePayload
	});

	void command.container.slowmodeManager?.handleSettingsUpdated(guildId);

	const trackedChannels = await channelService.listBucket(guildId, 'automaticSlowmodeChannels');

	// If we have component support, use it
	if (respondComponents) {
		const { createMultiSectionComponent } = await import('../../../lib/components.js');

		const formatChannels = (channels: string[]) => (channels.length ? channels.map((id) => `<#${id}>`) : ['*(none)*']);

		const sections = [
			{
				title: 'Updated Slowmode Settings',
				items: [
					`**Enabled:** ${updated.enabled ? 'Yes' : 'No'}`,
					`**Message Threshold:** ${updated.messageThreshold} message${updated.messageThreshold === 1 ? '' : 's'}`,
					`**Activity Window:** ${updated.messageTimeWindow} second${updated.messageTimeWindow === 1 ? '' : 's'}`,
					`**Cooldown Between Adjustments:** ${updated.cooldownDuration} second${updated.cooldownDuration === 1 ? '' : 's'}`,
					`**Reset After Inactivity:** ${updated.resetTime} second${updated.resetTime === 1 ? '' : 's'}`,
					`**Maximum Slowmode:** ${updated.maxSlowmode} second${updated.maxSlowmode === 1 ? '' : 's'}`
				],
				emptyMessage: '*(none)*',
				forceNewlines: true
			},
			{
				title: 'Tracked Channels',
				items: formatChannels(trackedChannels),
				emptyMessage: '*(none)*',
				forceNewlines: false
			}
		];

		const component = createMultiSectionComponent(sections);
		if (component) {
			return respondComponents([component]);
		}
		// Fallback to plain text if the component would exceed Discord limits
	}

	// Fallback to plain text for message commands
	return respond(`Updated slowmode settings:\n${formatSlowmodeSettings(updated, { trackedChannels })}`);
}

export function formatSlowmodeSettings(
	settings: Pick<GuildSlowmodeSettings, 'enabled' | 'messageThreshold' | 'messageTimeWindow' | 'cooldownDuration' | 'resetTime' | 'maxSlowmode'>,
	channelData: { trackedChannels: string[] }
) {
	const formatChannels = (channels: string[]) => (channels.length ? channels.map((id) => `<#${id}>`).join(', ') : '*(none)*');

	const lines = [
		`Enabled: ${settings.enabled ? 'Yes' : 'No'}`,
		`Message Threshold: ${settings.messageThreshold} message${settings.messageThreshold === 1 ? '' : 's'}`,
		`Activity Window: ${settings.messageTimeWindow} second${settings.messageTimeWindow === 1 ? '' : 's'}`,
		`Cooldown Between Adjustments: ${settings.cooldownDuration} second${settings.cooldownDuration === 1 ? '' : 's'}`,
		`Reset After Inactivity: ${settings.resetTime} second${settings.resetTime === 1 ? '' : 's'}`,
		`Maximum Slowmode: ${settings.maxSlowmode} second${settings.maxSlowmode === 1 ? '' : 's'}`,
		`Tracked Channels: ${formatChannels(channelData.trackedChannels)}`
	];

	return lines.join('\n');
}

export async function parseMessageConfigureArgs(args: Args): Promise<SlowmodeUpdateInput> {
	const updates: SlowmodeUpdateInput = {};
	const rawArgs: string[] = [];

	while (!args.finished) {
		const value = await args.pickResult('string');
		if (value.isErr()) break;
		rawArgs.push(value.unwrap());
	}

	for (const entry of rawArgs) {
		const [rawKey, rawValue] = entry.split('=');
		if (!rawKey || !rawValue) continue;
		const key = rawKey.toLowerCase();
		const value = rawValue.trim();

		switch (key) {
			case 'enabled': {
				const normalized = normalizeBoolean(value);
				if (normalized !== null) updates.enabled = normalized;
				break;
			}
			case 'threshold': {
				const parsed = Number(value);
				if (Number.isInteger(parsed)) updates.messageThreshold = parsed;
				break;
			}
			case 'window': {
				const parsed = Number(value);
				if (Number.isInteger(parsed)) updates.messageTimeWindow = parsed;
				break;
			}
			case 'cooldown': {
				const parsed = Number(value);
				if (Number.isInteger(parsed)) updates.cooldownDuration = parsed;
				break;
			}
			case 'reset': {
				const parsed = Number(value);
				if (Number.isInteger(parsed)) updates.resetTime = parsed;
				break;
			}
			case 'max': {
				const parsed = Number(value);
				if (Number.isInteger(parsed)) updates.maxSlowmode = parsed;
				break;
			}
			default:
				break;
		}
	}

	return updates;
}

function sanitizeUpdates(updates: SlowmodeUpdateInput): SlowmodeUpdateInput | null {
	const result: SlowmodeUpdateInput = {};

	if (updates.enabled !== undefined) {
		result.enabled = updates.enabled;
	}

	const clampPositive = (value?: number | null) => {
		if (value === undefined || value === null || !Number.isInteger(value) || value < 1) return null;
		return value;
	};

	const threshold = clampPositive(updates.messageThreshold);
	if (threshold !== null) result.messageThreshold = threshold;

	const window = clampPositive(updates.messageTimeWindow);
	if (window !== null) result.messageTimeWindow = window;

	const cooldown = clampPositive(updates.cooldownDuration);
	if (cooldown !== null) result.cooldownDuration = cooldown;

	const reset = clampPositive(updates.resetTime);
	if (reset !== null) result.resetTime = reset;

	const max = clampPositive(updates.maxSlowmode);
	if (max !== null) result.maxSlowmode = Math.min(max, DISCORD_MAX_SLOWMODE);

	return Object.keys(result).length > 0 ? result : null;
}

function buildUpdatePayload(current: GuildSlowmodeSettings, updates: SlowmodeUpdateInput): Partial<GuildSlowmodeSettings> | null {
	const payload: Partial<GuildSlowmodeSettings> = {};

	if (updates.enabled !== undefined && updates.enabled !== current.enabled) {
		payload.enabled = updates.enabled;
	}

	if (updates.messageThreshold !== undefined && updates.messageThreshold !== current.messageThreshold) {
		payload.messageThreshold = updates.messageThreshold;
	}

	if (updates.messageTimeWindow !== undefined && updates.messageTimeWindow !== current.messageTimeWindow) {
		payload.messageTimeWindow = updates.messageTimeWindow;
	}

	if (updates.cooldownDuration !== undefined && updates.cooldownDuration !== current.cooldownDuration) {
		payload.cooldownDuration = updates.cooldownDuration;
	}

	if (updates.resetTime !== undefined && updates.resetTime !== current.resetTime) {
		payload.resetTime = updates.resetTime;
	}

	if (updates.maxSlowmode !== undefined && updates.maxSlowmode !== current.maxSlowmode) {
		payload.maxSlowmode = updates.maxSlowmode;
	}

	return Object.keys(payload).length > 0 ? payload : null;
}

function normalizeBoolean(value: string) {
	const normalized = value.toLowerCase();
	if (['true', 'yes', 'on', 'enable', 'enabled', '1'].includes(normalized)) return true;
	if (['false', 'no', 'off', 'disable', 'disabled', '0'].includes(normalized)) return false;
	return null;
}

export const denyInteraction = (interaction: SlowmodeChatInputInteraction, content: string) =>
	interaction.reply({ content, flags: MessageFlags.Ephemeral });

export async function deferInteraction(interaction: SlowmodeChatInputInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}
