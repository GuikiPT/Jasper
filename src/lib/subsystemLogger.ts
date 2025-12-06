// Subsystem logger - Creates scoped loggers with automatic subsystem tagging and routing
import { Logger } from './logger';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Logger interface with subsystem-specific context
 */
export type SubsystemLogger = {
    debug: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void;
    error: (message: string, error?: unknown, meta?: Record<string, unknown>) => void;
    fatal: (message: string, error?: unknown, meta?: Record<string, unknown>) => void;
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Merges subsystem identifier into metadata object
 */
function mergeMeta(subsystem: string, meta?: Record<string, unknown>) {
    return meta ? { subsystem, ...meta } : { subsystem };
}

// ============================================================
// Logger Factory
// ============================================================

/**
 * Creates a scoped logger for a specific subsystem
 * - Automatically prefixes messages with subsystem name
 * - Tags all logs with subsystem metadata for file routing
 * - Enables subsystem-specific log files in logs/subsystems/
 * 
 * @param subsystem - Identifier for the subsystem (e.g., 'AutomodService', 'SupportThreads')
 * @returns Logger instance with subsystem context
 */
export function createSubsystemLogger(subsystem: string): SubsystemLogger {
    const prefix = `[${subsystem}]`;

    return {
        debug: (message, meta) => Logger.debug(`${prefix} ${message}`, mergeMeta(subsystem, meta)),
        info: (message, meta) => Logger.info(`${prefix} ${message}`, mergeMeta(subsystem, meta)),
        warn: (message, error, meta) => Logger.warn(`${prefix} ${message}`, error, mergeMeta(subsystem, meta)),
        error: (message, error, meta) => Logger.error(`${prefix} ${message}`, error, mergeMeta(subsystem, meta)),
        fatal: (message, error, meta) => Logger.fatal(`${prefix} ${message}`, error, mergeMeta(subsystem, meta))
    };
}
