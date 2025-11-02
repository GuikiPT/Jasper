// index module within root
import './lib/setup';

// Entrypoint wires services, shared managers, and bootstraps Sapphire client lifecycle.

import { LogLevel, SapphireClient } from '@sapphire/framework';
import { container } from '@sapphire/pieces';
import { envParseString } from '@skyra/env-utilities';
import { GatewayIntentBits, Partials } from 'discord.js';
import { ensureDatabaseReady } from './lib/database';
import { JasperLogger, Logger } from './lib/logger';
import { SlowmodeManager } from './services/slowmodeManager';
import { SnipeManager } from './services/snipeManager';
import { GuildSettingsService } from './services/guildSettingsService';
import { GuildRoleSettingsService } from './services/guildRoleSettingsService';
import { GuildChannelSettingsService } from './services/guildChannelSettingsService';
import { GuildSupportSettingsService } from './services/guildSupportSettingsService';
import { GuildSlowmodeSettingsService } from './services/guildSlowmodeSettingsService';
import { GuildTopicSettingsService } from './services/guildTopicSettingsService';
import { SupportTagService } from './services/supportTagService';
import { SupportThreadService } from './services/supportThreadService';
import { SupportThreadMonitor } from './services/supportThreadMonitor';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = isProduction ? LogLevel.Info : LogLevel.Debug;

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
		level: logLevel,
		instance: new JasperLogger({
			consoleLevel: logLevel,
			fileLevel: LogLevel.Debug
		})
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

container.guildSettingsService = new GuildSettingsService(container.database);
container.guildRoleSettingsService = new GuildRoleSettingsService(container.database, container.guildSettingsService);
container.guildChannelSettingsService = new GuildChannelSettingsService(container.database, container.guildSettingsService);
container.guildSupportSettingsService = new GuildSupportSettingsService(container.database, container.guildSettingsService);
container.guildSlowmodeSettingsService = new GuildSlowmodeSettingsService(container.database, container.guildSettingsService);
container.guildTopicSettingsService = new GuildTopicSettingsService(container.database);
container.supportTagService = new SupportTagService(container.database);
container.supportThreadService = new SupportThreadService(container.database);
container.supportThreadMonitor = new SupportThreadMonitor(
	client,
	container.supportThreadService,
	container.guildSupportSettingsService,
	container.database
);

container.slowmodeManager = new SlowmodeManager(client, container.database);
container.snipeManager = new SnipeManager(client, container.database);

// Handles the startup pipeline of verifying dependencies and logging into Discord.
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
