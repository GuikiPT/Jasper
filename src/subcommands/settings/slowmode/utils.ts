import type { GuildSlowmodeSettings } from '@prisma/client';
import type { Subcommand, SubcommandMappingGroup } from '@sapphire/plugin-subcommands';
import type { Args } from '@sapphire/framework';
import { MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { getStringArray } from '../channels/utils';

export type SlowmodeCommand = Subcommand;
export type SlowmodeChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export type SlowmodeViewContext = {
	command: SlowmodeCommand;
	guildId: string | null;
	respond: (content: string) => Promise<unknown>;
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
				.addBooleanOption((option) =>
					option
						.setName('enabled')
						.setDescription('Enable or disable automatic slowmode.')
				)
				.addIntegerOption((option) =>
					option
						.setName('threshold')
						.setDescription('Messages required within the time window before slowmode is applied.')
						.setMinValue(1)
				)
				.addIntegerOption((option) =>
					option
						.setName('window')
						.setDescription('Time window (in seconds) used to count message activity.')
						.setMinValue(1)
				)
				.addIntegerOption((option) =>
					option
						.setName('cooldown')
						.setDescription('Minimum seconds between slowmode adjustments.')
						.setMinValue(1)
				)
				.addIntegerOption((option) =>
					option
						.setName('reset')
						.setDescription('Seconds of inactivity before slowmode is cleared.')
						.setMinValue(1)
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

export async function executeSlowmodeView({ command, guildId, respond, deny, defer }: SlowmodeViewContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const settings = await ensureSlowmodeSettings(command, guildId);
	const channelSettings = await command.container.database.guildChannelSettings.findUnique({ where: { guildId } });

	const manualChannels = getStringArray(settings.enabledChannels);
	const unionChannels = new Set(manualChannels);
	if (channelSettings) {
		getStringArray(channelSettings.automaticSlowmodeChannels).forEach((id) => unionChannels.add(id));
	}

	const lines = formatSlowmodeSettings(settings, {
		manualChannels,
		allChannels: [...unionChannels]
	});

	return respond(lines);
}

export async function executeSlowmodeUpdate({ command, guildId, updates, respond, deny, defer }: SlowmodeUpdateContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	const sanitized = sanitizeUpdates(updates);
	if (!sanitized) {
		return deny('Provide at least one valid slowmode field to update.');
	}

	if (defer) {
		await defer();
	}

	let settings: GuildSlowmodeSettings;
	try {
		settings = await ensureSlowmodeSettings(command, guildId);
	} catch (error) {
		command.container.logger.error('Failed to ensure slowmode settings', error, { guildId });
		return respond('Something went wrong while loading slowmode settings. Please try again.');
	}

	const updatePayload = buildUpdatePayload(settings, sanitized);
	if (!updatePayload) {
		return respond('Slowmode settings already match the provided values.');
	}

	let updated: GuildSlowmodeSettings;
	try {
		updated = await command.container.database.guildSlowmodeSettings.update({
			where: { guildId },
			data: updatePayload
		});
	} catch (error) {
		command.container.logger.error('Failed to update slowmode settings', error, { guildId });
		return respond('Failed to update slowmode settings. Please try again later.');
	}

	command.container.logger.info('[Settings:Slowmode] Updated automatic slowmode settings', {
		guildId,
		updates: updatePayload
	});

	void command.container.slowmodeManager?.handleSettingsUpdated(guildId);

	const channelSettings = await command.container.database.guildChannelSettings.findUnique({ where: { guildId } });
	const manualChannels = getStringArray(updated.enabledChannels);
	const unionChannels = new Set(manualChannels);
	if (channelSettings) {
		getStringArray(channelSettings.automaticSlowmodeChannels).forEach((id) => unionChannels.add(id));
	}

	return respond(
		`Updated slowmode settings:\n${formatSlowmodeSettings(updated, {
			manualChannels,
			allChannels: [...unionChannels]
		})}`
	);
}

export function formatSlowmodeSettings(
	settings: Pick<
		GuildSlowmodeSettings,
		'enabled' | 'messageThreshold' | 'messageTimeWindow' | 'cooldownDuration' | 'resetTime' | 'maxSlowmode'
	>,
	channelData: { manualChannels: string[]; allChannels: string[] }
) {
	const formatChannels = (channels: string[]) => (channels.length ? channels.map((id) => `<#${id}>`).join(', ') : '*(none)*');

	const lines = [
		`Enabled: ${settings.enabled ? 'Yes' : 'No'}`,
		`Message Threshold: ${settings.messageThreshold} message${settings.messageThreshold === 1 ? '' : 's'}`,
		`Activity Window: ${settings.messageTimeWindow} second${settings.messageTimeWindow === 1 ? '' : 's'}`,
		`Cooldown Between Adjustments: ${settings.cooldownDuration} second${settings.cooldownDuration === 1 ? '' : 's'}`,
		`Reset After Inactivity: ${settings.resetTime} second${settings.resetTime === 1 ? '' : 's'}`,
		`Maximum Slowmode: ${settings.maxSlowmode} second${settings.maxSlowmode === 1 ? '' : 's'}`,
		`Manually Enabled Channels: ${formatChannels(channelData.manualChannels)}`,
		`All Tracked Channels: ${formatChannels(channelData.allChannels)}`
	];

	return lines.join('\n');
}

export async function ensureSlowmodeSettings(command: SlowmodeCommand, guildId: string): Promise<GuildSlowmodeSettings> {
	const existing = await command.container.database.guildSlowmodeSettings.findUnique({ where: { guildId } });
	if (existing) return existing;

	await command.container.database.guildSettings.upsert({
		where: { id: guildId },
		create: { id: guildId },
		update: {}
	});

	const created = await command.container.database.guildSlowmodeSettings.create({
		data: {
			guildId,
			enabledChannels: JSON.stringify([])
		}
	});

	command.container.logger.info('[Settings:Slowmode] Created default slowmode settings', { guildId });

	return created;
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

function buildUpdatePayload(
	current: GuildSlowmodeSettings,
	updates: SlowmodeUpdateInput
): Partial<GuildSlowmodeSettings> | null {
	const payload: Partial<GuildSlowmodeSettings> = {};

	if (updates.enabled !== undefined && updates.enabled !== current.enabled) {
		payload.enabled = updates.enabled;
	}

	if (
		updates.messageThreshold !== undefined &&
		updates.messageThreshold !== current.messageThreshold
	) {
		payload.messageThreshold = updates.messageThreshold;
	}

	if (
		updates.messageTimeWindow !== undefined &&
		updates.messageTimeWindow !== current.messageTimeWindow
	) {
		payload.messageTimeWindow = updates.messageTimeWindow;
	}

	if (
		updates.cooldownDuration !== undefined &&
		updates.cooldownDuration !== current.cooldownDuration
	) {
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
