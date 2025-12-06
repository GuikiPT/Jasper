// Database module - Prisma client initialization with readiness checks and lifecycle management
import { Prisma, PrismaClient } from '@prisma/client';
import { container } from '@sapphire/pieces';
import { Logger } from './logger';

// ============================================================
// Prisma Client Configuration
// ============================================================

// Initialize Prisma client with event-based logging
export const database = new PrismaClient({
    log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' }
    ]
});

// Required database tables for application functionality
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

// Readiness state tracking
let isDatabaseReady = false;
let pendingVerification: Promise<void> | null = null;
const SLOW_QUERY_MS = 3000; // Warn when queries exceed this threshold

// ============================================================
// Event-Based Logging
// ============================================================

// Log slow queries for performance monitoring
database.$on('query', (e: Prisma.QueryEvent) => {
    if (e.duration > SLOW_QUERY_MS) {
        // Avoid logging full query/params to reduce PII risk
        Logger.warn('Slow database query', undefined, { duration: e.duration, target: e.target });
    }
});

// Log Prisma engine errors
database.$on('error', (e) => {
    Logger.error('Prisma engine error', e, { target: (e as any).target });
});

// Log Prisma engine warnings
database.$on('warn', (e) => {
    Logger.warn('Prisma engine warning', undefined, { message: e.message, target: (e as any).target });
});

// ============================================================
// Database Readiness Check
// ============================================================

/**
 * Ensures database connection and validates schema
 * - Connects to database if not already connected
 * - Verifies all required tables exist
 * - Throws error if schema is incomplete
 */
export async function ensureDatabaseReady() {
    if (isDatabaseReady) return;

    // Use pending verification to avoid concurrent checks
    if (!pendingVerification) {
        pendingVerification = (async () => {
            try {
                // Establish database connection
                Logger.info('Connecting to database');
                await database.$connect();
                Logger.info('Database connected');

                // Query information_schema for available tables
                const rows = await database.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = DATABASE()
                `);

                // Check for missing required tables
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

// ============================================================
// Container Integration
// ============================================================

// Extend Sapphire container with database instance
declare module '@sapphire/pieces' {
    interface Container {
        database: PrismaClient;
    }
}

container.database = database;

// ============================================================
// Graceful Shutdown Handlers
// ============================================================

const shutdownSignals: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

// Handle SIGINT and SIGTERM for graceful shutdown
for (const signal of shutdownSignals) {
    process.once(signal, async () => {
        try {
            Logger.info('Shutting down, disconnecting database', { signal });
            await container.database.$disconnect();
            Logger.info('Database disconnected');
        } catch (error) {
            Logger.warn('Failed to disconnect database gracefully', error);
        } finally {
            // Re-emit signal to allow other handlers to run
            process.kill(process.pid, signal);
        }
    });
}

// Handle process exit for cleanup
process.once('beforeExit', async () => {
    try {
        await container.database.$disconnect();
    } catch (error) {
        Logger.warn('beforeExit database disconnect failed', error);
    }
});
