import { container } from '@sapphire/pieces';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function timestamp() {
	return new Date().toISOString();
}

function normalizeError(error: unknown) {
	if (error instanceof Error) {
		return { name: error.name, message: error.message, stack: error.stack };
	}
	if (typeof error === 'string') return { message: error };
	try {
		return { message: JSON.stringify(error) };
	} catch {
		return { message: String(error) };
	}
}

function log(level: LogLevel, message: string, error?: unknown, meta?: Record<string, unknown>) {
	const logger = container.logger as any;
	const payload = { ts: timestamp(), ...(meta ?? {}) };
	if (error !== undefined) {
		Object.assign(payload, { error: normalizeError(error) });
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
