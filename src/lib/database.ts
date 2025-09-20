import { Prisma, PrismaClient } from '@prisma/client';
import { container } from '@sapphire/pieces';

export const database = new PrismaClient();

const expectedTables = [
	'GuildConfig',
	'GuildRoleSettings',
	'GuildChannelSettings',
	'GuildSupportSettings',
	'GuildSupportTags',
	'GuildTopics'
];

let isDatabaseReady = false;
let pendingVerification: Promise<void> | null = null;

export async function ensureDatabaseReady() {
	if (isDatabaseReady) return;

	if (!pendingVerification) {
		pendingVerification = (async () => {
			await database.$connect();

			const rows = await database.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = DATABASE()
			`);

			const availableTables = new Set(rows.map((row) => row.table_name.toLowerCase()));
			const missingTables = expectedTables.filter((table) => !availableTables.has(table.toLowerCase()));

			if (missingTables.length > 0) {
				throw new Error(`Missing database tables: ${missingTables.join(', ')}`);
			}

			isDatabaseReady = true;
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
		await container.database.$disconnect();
		process.kill(process.pid, signal);
	});
}

process.once('beforeExit', async () => {
	await container.database.$disconnect();
});
