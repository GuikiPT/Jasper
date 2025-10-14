// database module within lib
import { Prisma, PrismaClient } from '@prisma/client';
import { container } from '@sapphire/pieces';
import { Logger } from './logger';

// Prisma client bootstrap with readiness checks and graceful shutdown hooks.

export const database = new PrismaClient({
	log: [
		{ level: 'query', emit: 'event' },
		{ level: 'error', emit: 'event' },
		{ level: 'warn', emit: 'event' }
	]
});

const expectedTables = [
	'GuildSettings',
	'GuildRoleSettings',
	'GuildChannelSettings',
	'GuildSupportSettings',
	'GuildSupportTagSettings',
	'GuildTopicSettings',
	'GuildSlowmodeSettings',
	'SupportThread'
];

let isDatabaseReady = false;
let pendingVerification: Promise<void> | null = null;
const SLOW_QUERY_MS = 3000; // warn when queries exceed this threshold

// Event-based Prisma logging for slow queries and engine warnings/errors
database.$on('query', (e: Prisma.QueryEvent) => {
	if (e.duration > SLOW_QUERY_MS) {
		// Avoid logging full query/params to reduce PII risk; include duration and target
		Logger.warn('Slow database query', undefined, { duration: e.duration, target: e.target });
	}
});

database.$on('error', (e) => {
	Logger.error('Prisma engine error', e, { target: (e as any).target });
});

database.$on('warn', (e) => {
	Logger.warn('Prisma engine warning', undefined, { message: e.message, target: (e as any).target });
});

export async function ensureDatabaseReady() {
	if (isDatabaseReady) return;

	if (!pendingVerification) {
		pendingVerification = (async () => {
			try {
				Logger.info('Connecting to database');
				await database.$connect();
				Logger.info('Database connected');

				const rows = await database.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
					SELECT table_name
					FROM information_schema.tables
					WHERE table_schema = DATABASE()
				`);

				const availableTables = new Set(rows.map((row) => row.table_name.toLowerCase()));
				const missingTables = expectedTables.filter((table) => !availableTables.has(table.toLowerCase()));

				if (missingTables.length > 0) {
					Logger.error('Database schema missing required tables', undefined, { missingTables });
					throw new Error(`Missing database tables: ${missingTables.join(', ')}`);
				}

				isDatabaseReady = true;
				Logger.info('Database schema validated');
			} catch (error) {
				if (error instanceof Error) {
					Logger.error('Database readiness check failed', error.message);
				} else {
					Logger.error('Database readiness check failed', undefined, { error });
				}
				throw error;
			}
		})();
	}

	try {
		await pendingVerification;
	} finally {
		pendingVerification = null;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		database: PrismaClient;
	}
}

container.database = database;

const shutdownSignals: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

for (const signal of shutdownSignals) {
	process.once(signal, async () => {
		try {
			Logger.info('Shutting down, disconnecting database', { signal });
			await container.database.$disconnect();
			Logger.info('Database disconnected');
		} catch (error) {
			Logger.warn('Failed to disconnect database gracefully', error);
		} finally {
			process.kill(process.pid, signal);
		}
	});
}

process.once('beforeExit', async () => {
	try {
		await container.database.$disconnect();
	} catch (error) {
		Logger.warn('beforeExit database disconnect failed', error);
	}
});
