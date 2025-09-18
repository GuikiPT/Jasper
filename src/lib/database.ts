import { PrismaClient } from '@prisma/client';
import { container } from '@sapphire/pieces';

export const database = new PrismaClient();

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
