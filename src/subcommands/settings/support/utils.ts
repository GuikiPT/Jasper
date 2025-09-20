import type { Args } from '@sapphire/framework';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { ChannelType, MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';

export type SupportCommand = Subcommand;
export type SupportChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export type SupportSetContext = {
	command: SupportCommand;
	guildId: string | null;
	setting: SupportSettingKey;
	value: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export type SupportViewContext = {
	command: SupportCommand;
	guildId: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	respondComponents?: (components: any[]) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export const SUPPORT_SETTINGS = [
	{ key: 'supportForumChannelId', label: 'Support Forum Channel' },
	{ key: 'resolvedTagId', label: 'Resolved Tag' }
] as const;

export type SupportSettingKey = (typeof SUPPORT_SETTINGS)[number]['key'];

export const settingLookup = new Map<string, SupportSettingKey>(
	SUPPORT_SETTINGS.flatMap((setting) => [
		[setting.key.toLowerCase(), setting.key],
		[setting.label.toLowerCase(), setting.key],
		// Add shorter aliases
		['forum', 'supportForumChannelId'],
		['channel', 'supportForumChannelId'],
		['resolved', 'resolvedTagId'],
		['tag', 'resolvedTagId']
	])
);

export const registerSupportSubcommandGroup = (group: SlashCommandSubcommandGroupBuilder) =>
	group
		.setName('support')
		.setDescription('Configure support forum settings.')
		.addSubcommand((sub) =>
			sub
				.setName('set')
				.setDescription('Set a support setting.')
				.addStringOption((option) =>
					option
						.setName('setting')
						.setDescription('Which setting to configure.')
						.setRequired(true)
						.addChoices(...SUPPORT_SETTINGS.map((s) => ({ name: s.label, value: s.key })))
				)
				.addStringOption((option) =>
					option
						.setName('value')
						.setDescription('Channel ID or Tag ID to set (leave empty to remove).')
						.setRequired(false)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('view')
				.setDescription('View current support settings.')
		);

export function formatError(error: unknown) {
	if (error instanceof Error) return error.message;
	return 'An unexpected error occurred.';
}

export async function parseSetting(args: Args): Promise<SupportSettingKey> {
	const result = await args.pickResult('string');

	if (result.isErr()) {
		throw new Error(
			`You must provide a support setting. Available options: ${SUPPORT_SETTINGS.map((s) => s.key).join(', ')}`
		);
	}

	const value = result.unwrap();
	const resolved = settingLookup.get(value.toLowerCase());
	if (!resolved) {
		throw new Error(`Unknown support setting "${value}". Try one of: ${SUPPORT_SETTINGS.map((s) => s.key).join(', ')}`);
	}
	return resolved;
}

export function parseSettingChoice(value: string): SupportSettingKey {
	const resolved = settingLookup.get(value.toLowerCase());
	if (!resolved) {
		throw new Error(`Unknown support setting "${value}". Try one of: ${SUPPORT_SETTINGS.map((s) => s.key).join(', ')}`);
	}
	return resolved;
}

export async function executeSupportSet({
	command,
	guildId,
	setting,
	value,
	deny,
	respond,
	defer
}: SupportSetContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const label = settingLabel(setting);

	// If no value provided, remove the setting
	if (!value || value.trim() === '') {
		try {
			await command.container.database.guildSupportSettings.upsert({
				where: { guildId },
				create: {
					guildId,
					[setting]: null
				},
				update: {
					[setting]: null
				}
			});
		} catch (error) {
			return respond('Failed to update support settings. Please try again later.');
		}

		return respond(`Removed **${label}** setting.`);
	}

	// Validate the value based on the setting type
	if (setting === 'supportForumChannelId') {
		// Validate it's a valid channel ID and it's a forum channel
		try {
			const guild = command.container.client.guilds.cache.get(guildId);
			if (guild) {
				const channel = await guild.channels.fetch(value);
				if (!channel) {
					return deny('Invalid channel ID provided.');
				}
				if (channel.type !== ChannelType.GuildForum) {
					return deny('The specified channel must be a forum channel.');
				}
			}
		} catch {
			return deny('Invalid channel ID provided.');
		}
	}

	// Ensure GuildConfig exists first (required for foreign key constraint)
	try {
		await command.container.database.guildConfig.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});

		await command.container.database.guildSupportSettings.upsert({
			where: { guildId },
			create: {
				guildId,
				[setting]: value
			},
			update: {
				[setting]: value
			}
		});
	} catch (error) {
		return respond('Failed to update support settings. Please try again later.');
	}

	if (setting === 'supportForumChannelId') {
		return respond(`Set **${label}** to <#${value}>.`);
	} else {
		return respond(`Set **${label}** to \`${value}\`.`);
	}
}

export async function executeSupportView({
	command,
	guildId,
	deny,
	respond,
	respondComponents,
	defer
}: SupportViewContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	let settings: Awaited<ReturnType<typeof command.container.database.guildSupportSettings.findUnique>> | null = null;
	try {
		settings = await command.container.database.guildSupportSettings.findUnique({
			where: { guildId }
		});
	} catch {
		return respond('Failed to load support settings. Please try again later.');
	}

	// Use components if available
	if (respondComponents) {
		const { createListComponent } = await import('../../../lib/components.js');

		if (!settings) {
			const component = createListComponent(
				'Support Settings',
				[],
				'No support settings configured for this server.'
			);
			return respondComponents([component]);
		}

		const items = SUPPORT_SETTINGS.map((setting) => {
			const value = settings[setting.key];
			const label = setting.label;

			if (!value) {
				return `${label}: *(not set)*`;
			}

			if (setting.key === 'supportForumChannelId') {
				return `${label}: <#${value}>`;
			} else {
				return `${label}: \`${value}\``;
			}
		});

		const component = createListComponent('Support Settings', items);
		return respondComponents([component]);
	}

	// Fallback to plain text
	if (!settings) {
		return respond('No support settings configured for this server.');
	}

	const lines = SUPPORT_SETTINGS.map((setting) => {
		const value = settings[setting.key];
		const label = setting.label;

		if (!value) {
			return `**${label}:** *(not set)*`;
		}

		if (setting.key === 'supportForumChannelId') {
			return `**${label}:** <#${value}>`;
		} else {
			return `**${label}:** \`${value}\``;
		}
	});

	return respond(`**Support Settings:**\n${lines.join('\n')}`);
}

export function settingLabel(setting: SupportSettingKey) {
	return SUPPORT_SETTINGS.find((entry) => entry.key === setting)?.label ?? setting;
}

export const denyInteraction = (interaction: SupportChatInputInteraction, content: string) =>
	interaction.reply({ content, flags: MessageFlags.Ephemeral });
