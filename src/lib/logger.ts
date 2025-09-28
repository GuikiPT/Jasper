// logger module within lib
import { LogLevel } from '@sapphire/framework';
import { container } from '@sapphire/pieces';
import { Logger as BaseLogger, type LoggerOptions } from '@sapphire/plugin-logger';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { rootDir } from './constants';

// Custom logger implementation that mirrors Sapphire logging while persisting structured files.

const LEVEL_LABELS: Record<number, string> = {
	[LogLevel.Trace]: 'TRACE',
	[LogLevel.Debug]: 'DEBUG',
	[LogLevel.Info]: 'INFO',
	[LogLevel.Warn]: 'WARN',
	[LogLevel.Error]: 'ERROR',
	[LogLevel.Fatal]: 'FATAL',
	[LogLevel.None]: 'NONE'
};

const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

type SapphireLogMethod = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function stripAnsi(value: string) {
	return value.replace(ANSI_PATTERN, '');
}

function timestamp() {
	return new Date().toISOString();
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
	if (typeof value === 'string') {
		return stripAnsi(value);
	}

	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value !== 'object') {
		return value;
	}

	if (value instanceof Date || value instanceof Buffer) {
		return value;
	}

	if (value instanceof Error) {
		return {
			errorName: stripAnsi(value.name),
			errorMessage: stripAnsi(value.message),
			errorStack: value.stack ? stripAnsi(value.stack) : undefined
		};
	}

	if (seen.has(value as object)) {
		return '[Circular]';
	}

	seen.add(value as object);

	if (Array.isArray(value)) {
		return value.map((entry) => sanitizeValue(entry, seen));
	}

	const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeValue(entry, seen)]);
	return Object.fromEntries(entries);
}

function normalizeError(error: unknown) {
	if (error instanceof Error) {
		const normalized: Record<string, unknown> = {
			errorName: stripAnsi(error.name),
			errorMessage: stripAnsi(error.message)
		};
		if (error.stack) normalized.errorStack = stripAnsi(error.stack);
		return normalized;
	}

	if (typeof error === 'string') {
		return { errorMessage: stripAnsi(error) };
	}

	const sanitized = sanitizeValue(error);
	try {
		return { errorMessage: JSON.stringify(sanitized) };
	} catch {
		return { errorMessage: String(sanitized) };
	}
}

function formatForFile(value: unknown): string {
	if (value instanceof Error) {
		return JSON.stringify({
			errorName: stripAnsi(value.name),
			errorMessage: stripAnsi(value.message),
			errorStack: value.stack ? stripAnsi(value.stack) : undefined
		});
	}

	const sanitized = sanitizeValue(value);

	if (typeof sanitized === 'string') return sanitized;
	if (typeof sanitized === 'number' || typeof sanitized === 'bigint' || typeof sanitized === 'boolean') {
		return String(sanitized);
	}
	if (sanitized === null) return 'null';
	if (sanitized === undefined) return 'undefined';

	try {
		return JSON.stringify(sanitized);
	} catch {
		return inspect(sanitized, { depth: 3, breakLength: Number.POSITIVE_INFINITY, colors: false });
	}
}

function getLevelLabel(level: LogLevel) {
	return LEVEL_LABELS[level] ?? `LEVEL(${level})`;
}

function log(level: SapphireLogMethod, message: string, error?: unknown, meta?: Record<string, unknown>) {
	const logger = container.logger as unknown as Partial<Record<SapphireLogMethod, (message: string, meta?: Record<string, unknown>) => void>>;
	const payload: Record<string, unknown> = { ts: timestamp() };

	const sanitizedMeta = meta ? sanitizeValue(meta) : undefined;
	if (sanitizedMeta !== undefined) {
		if (sanitizedMeta && typeof sanitizedMeta === 'object' && !Array.isArray(sanitizedMeta)) {
			Object.assign(payload, sanitizedMeta as Record<string, unknown>);
		} else {
			payload.meta = sanitizedMeta;
		}
	}

	if (error !== undefined) {
		const normalizedError = normalizeError(error);
		for (const [key, value] of Object.entries(normalizedError)) {
			if (value === undefined || value === null) continue;
			payload[key] = value;
		}
	}

	const cleanMessage = stripAnsi(message);

	if (logger?.[level]) {
		logger[level](cleanMessage, payload);
		return;
	}

	// Fallback to console if Sapphire logger is unavailable
	// eslint-disable-next-line no-console
	console.log(`[${level.toUpperCase()}] ${cleanMessage}`, payload);
}

export interface JasperLoggerOptions extends LoggerOptions {
	consoleLevel?: LogLevel;
	fileLevel?: LogLevel;
}

export class JasperLogger extends BaseLogger {
	private readonly fileLevel: LogLevel;

	public constructor(options: JasperLoggerOptions = {}) {
		const { consoleLevel = options.level ?? LogLevel.Info, fileLevel = LogLevel.Debug, ...rest } = options;
		super({ ...rest, level: consoleLevel });
		this.fileLevel = fileLevel;
	}

	public override write(level: LogLevel, ...values: readonly unknown[]) {
		if (level >= this.fileLevel) {
			void this.writeToDisk(level, values);
		}

		super.write(level, ...values);
	}

	private async writeToDisk(level: LogLevel, values: readonly unknown[]) {
		const now = new Date();
		const year = now.getUTCFullYear().toString();
		const month = String(now.getUTCMonth() + 1).padStart(2, '0');
		const day = String(now.getUTCDate()).padStart(2, '0');

		const directory = join(rootDir, 'logs', year, month);
		const filePath = join(directory, `${day}.log`);

		try {
			await mkdir(directory, { recursive: true });
			const entry = `${now.toISOString()} ${getLevelLabel(level)} ${this.formatValues(values)}\n`;
			await appendFile(filePath, entry, 'utf8');
		} catch (error) {
			this.console.error('Failed to write log entry', this.normalizeForConsole(error));
		}
	}

	private formatValues(values: readonly unknown[]) {
		if (values.length === 0) return '';

		const [first, ...rest] = values;
		const message = formatForFile(first);
		if (rest.length === 0) return message;

		if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null) {
			return `${message} ${formatForFile(rest[0])}`;
		}

		return `${message} ${formatForFile(rest)}`;
	}

	private normalizeForConsole(value: unknown) {
		if (value instanceof Error) {
			return { errorName: value.name, errorMessage: value.message, errorStack: value.stack };
		}

		return sanitizeValue(value);
	}
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
