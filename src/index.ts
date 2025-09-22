import './lib/setup';

import { LogLevel, SapphireClient } from '@sapphire/framework';
import { container } from '@sapphire/pieces';
import { envParseString } from '@skyra/env-utilities';
import { GatewayIntentBits, Partials } from 'discord.js';
import { ensureDatabaseReady } from './lib/database';
import { Logger } from './lib/logger';

const client = new SapphireClient({
	defaultPrefix: 'j!',
	fetchPrefix: async (message) => {
		const sapphireClient = message.client as SapphireClient;
		const defaults = sapphireClient.options.defaultPrefix;
		const fallback = (() => {
			if (!defaults) return null;
			if (typeof defaults === 'string') return defaults;
			return defaults[0] ?? null;
		})();

		if (!message.guildId) return fallback;

		try {
			const guildSettings = await container.database.guildSettings.findUnique({
				where: { id: message.guildId }
			});
			if (guildSettings?.prefix) return guildSettings.prefix;
		} catch (error) {
			sapphireClient.logger.error('Failed to fetch prefix from database', error);
		}

		return fallback;
	},
	regexPrefix: /^(hey +)?bot[,! ]/i,
	caseInsensitiveCommands: true,
	logger: {
		level: LogLevel.Debug
	},
	shards: 'auto',
	intents: [
		GatewayIntentBits.DirectMessageReactions,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.GuildModeration,
		GatewayIntentBits.GuildExpressions,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent
	],
	partials: [Partials.Channel],
	loadMessageCommandListeners: true
});

const main = async () => {
	try {
		client.logger.info('Checking database connectivity');
		await ensureDatabaseReady();
		client.logger.info('Database connection verified');
		client.logger.info('Logging in');
		await client.login(envParseString('DISCORD_TOKEN'));
		client.logger.info('logged in');
	} catch (error) {
		Logger.fatal('Fatal error during startup', error);
		await client.destroy();
		process.exit(1);
	}
};

void main();

// Global safety nets
process.on('unhandledRejection', (reason, promise) => {
	Logger.error('Unhandled promise rejection', reason, { promise: String(promise) });
});

process.on('uncaughtException', (error) => {
	Logger.fatal('Uncaught exception', error);
});
