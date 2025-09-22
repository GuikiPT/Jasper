import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import type { Args } from '@sapphire/framework';

type PrefixCommand = Subcommand;
export type { PrefixCommand };
export type PrefixChatInputInteraction = Subcommand.ChatInputCommandInteraction;

type PrefixExecutionContext = {
	command: PrefixCommand;
	guildId: string | null;
	providedPrefix: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string) => Promise<unknown>;
	respondComponents?: (components: any[]) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

interface PrefixHandlerParams {
	guildId: string;
	providedPrefix: string | null;
	defaultPrefix: string | null;
}

export async function executePrefixRequest({
	command,
	guildId,
	providedPrefix,
	deny,
	respond,
	respondComponents,
	defer
}: PrefixExecutionContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const defaultPrefix = getDefaultPrefix(command);
	const result = await handlePrefixCommon(command, {
		guildId,
		providedPrefix,
		defaultPrefix
	});

	// Use components if available
	if (respondComponents && !providedPrefix) {
		const { createListComponent } = await import('../../../lib/components.js');
		const resolvedPrefix = result.content.includes('current prefix is')
			? result.content.match(/`(.+?)`/)?.[1] || 'None'
			: 'None';

		const component = createListComponent(
			'Server Prefix',
			resolvedPrefix !== 'None' ? [resolvedPrefix] : [],
			'No custom prefix configured. Using default prefix.'
		);
		return respondComponents([component]);
	}

	return respond(result.content);
}

export function getDefaultPrefix(command: PrefixCommand): string | null {
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
	{ guildId, providedPrefix, defaultPrefix }: PrefixHandlerParams
) {
	if (providedPrefix !== null) {
		const trimmedPrefix = providedPrefix.trim();

		if (trimmedPrefix.length === 0) {
			return { content: 'The prefix cannot be empty.' };
		}

		if (trimmedPrefix.length > 16) {
			return { content: 'The prefix must be 16 characters or fewer.' };
		}

		try {
			await command.container.database.guildSettings.upsert({
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
		const guildSettings = await command.container.database.guildSettings.findUnique({
			where: { id: guildId }
		});
		const resolvedPrefix = guildSettings?.prefix ?? defaultPrefix; if (resolvedPrefix) {
			return { content: `The current prefix is \`${resolvedPrefix}\`.` };
		}

		return { content: 'There is no prefix configured for this server.' };
	} catch (error) {
		command.container.logger.error('Failed to load prefix from database', error);
		return { content: 'Failed to fetch the prefix. Please try again later.' };
	}
}

export async function pickOptionalString(args: Args) {
	return args.pick('string').catch(() => null);
}

export const ephemeralResponse = (interaction: PrefixChatInputInteraction, content: string) =>
	interaction.reply({ content, flags: MessageFlags.Ephemeral });
