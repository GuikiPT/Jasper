import { container } from '@sapphire/pieces';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function timestamp() {
	return new Date().toISOString();
}

function normalizeError(error: unknown) {
	if (error instanceof Error) {
		const normalized: Record<string, unknown> = {
			errorName: error.name,
			errorMessage: error.message
		};
		if (error.stack) normalized.errorStack = error.stack;
		return normalized;
	}

	if (typeof error === 'string') {
		return { errorMessage: error };
	}

	try {
		return { errorMessage: JSON.stringify(error) };
	} catch {
		return { errorMessage: String(error) };
	}
}

function log(level: LogLevel, message: string, error?: unknown, meta?: Record<string, unknown>) {
	const logger = container.logger as any;
	const payload: Record<string, unknown> = { ts: timestamp(), ...(meta ?? {}) };
	if (error !== undefined) {
		const normalizedError = normalizeError(error);
		for (const [key, value] of Object.entries(normalizedError)) {
			if (value === undefined || value === null) continue;
			payload[key] = value;
		}
	}

	if (logger?.[level]) {
		logger[level](message, payload);
		return;
	}

	// Fallback to console if Sapphire logger is unavailable
	// eslint-disable-next-line no-console
	console.log(`[${level.toUpperCase()}] ${message}`, payload);
}

export const Logger = {
	debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, undefined, meta),
	info: (message: string, meta?: Record<string, unknown>) => log('info', message, undefined, meta),
	warn: (message: string, error?: unknown, meta?: Record<string, unknown>) => log('warn', message, error, meta),
	error: (message: string, error?: unknown, meta?: Record<string, unknown>) => log('error', message, error, meta),
	fatal: (message: string, error?: unknown, meta?: Record<string, unknown>) => log('fatal', message, error, meta)
};

export function withGuild(meta: Record<string, unknown>, guildId: string | null | undefined) {
	return { ...meta, guildId: guildId ?? 'unknown' };
}
