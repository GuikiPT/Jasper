// subsystemLogger module within lib
import { Logger } from './logger';

export type SubsystemLogger = {
	debug: (message: string, meta?: Record<string, unknown>) => void;
	info: (message: string, meta?: Record<string, unknown>) => void;
	warn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void;
	error: (message: string, error?: unknown, meta?: Record<string, unknown>) => void;
	fatal: (message: string, error?: unknown, meta?: Record<string, unknown>) => void;
};

function mergeMeta(subsystem: string, meta?: Record<string, unknown>) {
	return meta ? { subsystem, ...meta } : { subsystem };
}

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
