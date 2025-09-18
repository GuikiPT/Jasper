import type { Args } from '@sapphire/framework';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import {
	MessageFlags,
	PermissionFlagsBits,
	type Message,
	type SlashCommandSubcommandBuilder
} from 'discord.js';

type PrefixHandlerParams = {
	guildId: string;
	providedPrefix: string | null;
	defaultPrefix: string | null;
	hasManageGuild: boolean;
};

type PrefixCommand = Subcommand;

type PrefixChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export const prefixSubcommandMapping = {
	name: 'prefix',
	default: true,
	chatInputRun: 'chatInputPrefix',
	messageRun: 'messagePrefix'
} as const;

export const registerPrefixSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
	subcommand
		.setName('prefix')
		.setDescription('View or update the prefix used for message commands.')
		.addStringOption((option) =>
			option
				.setName('value')
				.setDescription('New prefix to save. Leave empty to view the current prefix.')
				.setMaxLength(16)
		);

export async function runPrefixMessage(command: PrefixCommand, message: Message, args: Args) {
	const providedPrefix = await args.pick('string').catch(() => null);

	return executePrefixRequest({
		command,
		guildId: message.guildId ?? null,
		providedPrefix,
		hasManageGuild: Boolean(message.member?.permissions.has(PermissionFlagsBits.ManageGuild)),
		deny: (content) => message.reply(content),
		respond: (content) => message.reply(content)
	});
}

export async function runPrefixChatInput(command: PrefixCommand, interaction: PrefixChatInputInteraction) {
	return executePrefixRequest({
		command,
		guildId: interaction.guildId ?? null,
		providedPrefix: interaction.options.getString('value'),
		hasManageGuild: Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)),
		deny: (content) =>
			interaction.reply({
				content,
				flags: MessageFlags.Ephemeral
			}),
		respond: (content) => interaction.editReply({ content }),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

type PrefixExecutionContext = {
	command: PrefixCommand;
	guildId: string | null;
	providedPrefix: string | null;
	hasManageGuild: boolean;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

async function executePrefixRequest({
	command,
	guildId,
	providedPrefix,
	hasManageGuild,
	deny,
	respond,
	defer
}: PrefixExecutionContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (!hasManageGuild) {
		return deny('You need the `Manage Server` permission to use this command.');
	}

	if (defer) {
		await defer();
	}

	const defaultPrefix = getDefaultPrefix(command);
	const result = await handlePrefixCommon(command, {
		guildId,
		providedPrefix,
		defaultPrefix,
		hasManageGuild
	});

	return respond(result.content);
}

function getDefaultPrefix(command: PrefixCommand): string | null {
	const defaults = command.container.client.options.defaultPrefix;

	if (!defaults) {
		return null;
	}

	if (typeof defaults === 'string') {
		return defaults;
	}

	return defaults[0] ?? null;
}

async function handlePrefixCommon(
	command: PrefixCommand,
	{ guildId, providedPrefix, defaultPrefix, hasManageGuild }: PrefixHandlerParams
) {
	if (providedPrefix !== null) {
		if (!hasManageGuild) {
			return { content: 'You need the `Manage Server` permission to change the prefix.' };
		}

		const trimmedPrefix = providedPrefix.trim();

		if (trimmedPrefix.length === 0) {
			return { content: 'The prefix cannot be empty.' };
		}

		if (trimmedPrefix.length > 16) {
			return { content: 'The prefix must be 16 characters or fewer.' };
		}

		try {
			await command.container.database.guildConfig.upsert({
				where: { id: guildId },
				create: { id: guildId, prefix: trimmedPrefix },
				update: { prefix: trimmedPrefix }
			});
		} catch (error) {
			command.container.logger.error('Failed to update prefix in database', error);
			return { content: 'Failed to update the prefix. Please try again later.' };
		}

		return { content: `Updated the prefix to \`${trimmedPrefix}\`.` };
	}

	try {
		const guildConfig = await command.container.database.guildConfig.findUnique({
			where: { id: guildId }
		});
		const resolvedPrefix = guildConfig?.prefix ?? defaultPrefix;

		if (resolvedPrefix) {
			return { content: `The current prefix is \`${resolvedPrefix}\`.` };
		}

		return { content: 'There is no prefix configured for this server.' };
	} catch (error) {
		command.container.logger.error('Failed to load prefix from database', error);
		return { content: 'Failed to fetch the prefix. Please try again later.' };
	}
}
