import './lib/setup';

import { LogLevel, SapphireClient } from '@sapphire/framework';
import { container } from '@sapphire/pieces';
import { GatewayIntentBits, Partials } from 'discord.js';

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
			const guildConfig = await container.database.guildConfig.findUnique({
				where: { id: message.guildId }
			});
			if (guildConfig?.prefix) return guildConfig.prefix;
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
		GatewayIntentBits.GuildEmojisAndStickers,
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
		client.logger.info('Logging in');
		await client.login();
		client.logger.info('logged in');
	} catch (error) {
		client.logger.fatal(error);
		await client.destroy();
		process.exit(1);
	}
};

void main();
