// utils module within lib
import type {
	ChatInputCommandAcceptedPayload,
	ChatInputCommandSuccessPayload,
	Command,
	ContextMenuCommandSuccessPayload,
	MessageCommandSuccessPayload
} from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { EmbedBuilder, type APIUser, type Guild, type Message, type User } from 'discord.js';
import { Logger } from './logger';
import { RandomLoadingMessage } from './constants';

// Miscellaneous shared helpers for messaging and command logging.

/**
 * Picks a random item from an array
 * @param array The array to pick a random item from
 * @example
 * const randomEntry = pickRandom([1, 2, 3, 4]) // 1
 */
export function pickRandom<T>(array: readonly T[]): T {
	const { length } = array;
	return array[Math.floor(Math.random() * length)];
}

/**
 * Sends a loading message to the current channel
 * @param message The message data for which to send the loading message
 */
export function sendLoadingMessage(message: Message): Promise<typeof message> {
	return send(message, { embeds: [new EmbedBuilder().setDescription(pickRandom(RandomLoadingMessage)).setColor('#FF0000')] });
}

/**
 * Safely parses a JSON-encoded string array column coming from the database
 */
export function parseJsonStringArray(value: string | null | undefined): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
	} catch (error) {
		Logger.debug('Failed to parse JSON string array', {
			error,
			inputLength: value.length,
			sample: value.slice(0, 120)
		});
		return [];
	}
}

export function logSuccessCommand(
	payload:
		| ContextMenuCommandSuccessPayload
		| ChatInputCommandSuccessPayload
		| ChatInputCommandAcceptedPayload
		| MessageCommandSuccessPayload,
	stage: 'accepted' | 'success' = 'success'
): void {
	if ('interaction' in payload) {
		const subcommandPath = getSubcommandPath(payload.interaction.options);
		const successLoggerData = {
			...getSuccessLoggerData(payload.interaction.guild, payload.interaction.user, payload.command, subcommandPath, stage),
			channelId: payload.interaction.channelId ?? null,
			interactionId: payload.interaction.id,
			eventKind: resolveInteractionKind(payload.interaction)
		};
		Logger.debug('Command telemetry', successLoggerData);
		return;
	}

	const successLoggerData = {
		...getSuccessLoggerData(payload.message.guild, payload.message.author, payload.command, null, stage),
		channelId: payload.message.channelId,
		messageId: payload.message.id,
		eventKind: 'message'
	};

	Logger.debug('Command telemetry', successLoggerData);
}

export function getSuccessLoggerData(
	guild: Guild | null,
	user: User,
	command: Command,
	subcommandPath: string | null,
	stage: 'accepted' | 'success'
) {
	const shardId = guild?.shardId ?? 0;
	const commandPath = getCommandInfo(command, subcommandPath ?? undefined);
	const userMeta = getAuthorInfo(user);
	const guildMeta = getGuildInfo(guild);

	return {
		stage,
		shardId,
		command: command.name,
		commandPath,
		subcommandPath,
		userId: user.id,
		username: userMeta.username,
		guildId: guildMeta.guildId,
		guildName: guildMeta.guildName,
		context: guildMeta.context
	};
}

function getCommandInfo(command: Command, subcommandPath?: string) {
	const fullPath = subcommandPath ? `${command.name} ${subcommandPath}` : command.name;
	return fullPath;
}

function getAuthorInfo(author: User | APIUser) {
	return { username: author.username, userId: author.id };
}

function getGuildInfo(guild: Guild | null) {
	if (guild === null) return { guildId: null, guildName: null, context: 'Direct Messages' };
	return { guildId: guild.id, guildName: guild.name, context: 'Guild' };
}

function getSubcommandPath(options: unknown): string | null {
	if (!options || typeof options !== 'object') return null;
	try {
		// options is a CommandInteractionOptionResolver
		const group = (options as any).getSubcommandGroup?.(false);
		const sub = (options as any).getSubcommand?.(false);
		const parts = [] as string[];
		if (group) parts.push(String(group));
		if (sub) parts.push(String(sub));
		return parts.length ? parts.join(' ') : null;
	} catch {
		return null;
	}
}

function resolveInteractionKind(interaction: unknown) {
	if (interaction && typeof interaction === 'object' && 'isChatInputCommand' in interaction && typeof (interaction as any).isChatInputCommand === 'function') {
		try {
			if ((interaction as any).isChatInputCommand()) return 'chatInput';
		} catch { }
	}

	if (interaction && typeof interaction === 'object' && 'isContextMenuCommand' in interaction && typeof (interaction as any).isContextMenuCommand === 'function') {
		try {
			if ((interaction as any).isContextMenuCommand()) return 'contextMenu';
		} catch { }
	}

	return 'interaction';
}
