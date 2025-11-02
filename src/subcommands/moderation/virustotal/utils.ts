// Shared utilities for VirusTotal operations
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import {
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	FileBuilder,
	ContainerBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	type MessageActionRowComponentBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder
} from 'discord.js';

import { VIRUSTOTAL_CONFIG, ERROR_MESSAGES, STATUS_CONFIG, REPORT_TEMPLATES } from './constants';
import type { VirusTotalAnalysisStats, SecurityStatus, VirusTotalEngineResult } from './types';

/**
 * Rate limiter for VirusTotal API calls
 */
class RateLimiter {
	private requests: number[] = [];
	private readonly maxRequests: number;
	private readonly windowMs: number;

	constructor(maxRequests: number = VIRUSTOTAL_CONFIG.API.RATE_LIMITS.PUBLIC.REQUESTS_PER_MINUTE, windowMs: number = 60000) {
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;
	}

	async wait(): Promise<void> {
		const now = Date.now();

		// Remove old requests outside the window
		this.requests = this.requests.filter((time) => now - time < this.windowMs);

		if (this.requests.length >= this.maxRequests) {
			const oldestRequest = Math.min(...this.requests);
			const waitTime = this.windowMs - (now - oldestRequest);
			if (waitTime > 0) {
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		}

		this.requests.push(now);
	}
}

const rateLimiter = new RateLimiter();

/**
 * Validates API key availability
 */
export function validateApiKey(): string {
	const apiKey = process.env.VIRUSTOTAL_API_KEY;
	if (!apiKey) {
		throw new Error(ERROR_MESSAGES.API_KEY_MISSING);
	}
	return apiKey;
}

/**
 * Makes a rate-limited API request to VirusTotal
 */
export async function makeVirusTotalRequest<T>(config: AxiosRequestConfig): Promise<T> {
	await rateLimiter.wait();

	const apiKey = validateApiKey();

	const requestConfig: AxiosRequestConfig = {
		...config,
		timeout: config.timeout || VIRUSTOTAL_CONFIG.SECURITY.API_TIMEOUT_MS,
		headers: {
			accept: 'application/json',
			'x-apikey': apiKey,
			...config.headers
		}
	};

	let lastError: Error;

	for (let attempt = 1; attempt <= VIRUSTOTAL_CONFIG.SECURITY.MAX_RETRIES; attempt++) {
		try {
			const response = await axios.request<T>(requestConfig);
			return response.data;
		} catch (error) {
			lastError = error as Error;

			if (axios.isAxiosError(error)) {
				// Don't retry on client errors (4xx) except rate limiting
				if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
					if (error.response.status === 429) {
						// Rate limited, wait longer
						await new Promise((resolve) => setTimeout(resolve, VIRUSTOTAL_CONFIG.SECURITY.RETRY_DELAY_MS * attempt));
						continue;
					}
					throw error;
				}
			}

			if (attempt < VIRUSTOTAL_CONFIG.SECURITY.MAX_RETRIES) {
				await new Promise((resolve) => setTimeout(resolve, VIRUSTOTAL_CONFIG.SECURITY.RETRY_DELAY_MS * attempt));
			}
		}
	}

	throw lastError!;
}

/**
 * Securely downloads a file with size and security checks
 */
export async function secureFileDownload(fileUrl: string, maxSizeMB: number): Promise<Buffer> {
	const maxSizeBytes = maxSizeMB * 1024 * 1024;

	// Validate URL format
	try {
		new URL(fileUrl);
	} catch {
		throw new Error(ERROR_MESSAGES.INVALID_URL);
	}

	try {
		const response = await axios({
			method: 'GET',
			url: fileUrl,
			responseType: 'stream',
			timeout: VIRUSTOTAL_CONFIG.SECURITY.DOWNLOAD_TIMEOUT_MS,
			maxRedirects: 0,
			validateStatus: (status) => status === 200,
			headers: {
				'User-Agent': VIRUSTOTAL_CONFIG.UI.USER_AGENT
			}
		});

		const chunks: Buffer[] = [];
		let totalSize = 0;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				response.data.destroy();
				reject(new Error('Download timeout exceeded'));
			}, VIRUSTOTAL_CONFIG.SECURITY.DOWNLOAD_TIMEOUT_MS);

			response.data.on('data', (chunk: Buffer) => {
				totalSize += chunk.length;

				if (totalSize > maxSizeBytes) {
					response.data.destroy();
					clearTimeout(timeout);
					reject(new Error(`File too large: ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds ${maxSizeMB}MB limit`));
					return;
				}

				chunks.push(chunk);
			});

			response.data.on('end', () => {
				clearTimeout(timeout);
				try {
					const buffer = Buffer.concat(chunks);
					chunks.length = 0; // Clear memory
					resolve(buffer);
				} catch (error) {
					reject(new Error('Failed to concatenate file chunks'));
				}
			});

			response.data.on('error', (error: Error) => {
				clearTimeout(timeout);
				reject(new Error(`Download failed: ${error.message}`));
			});
		});
	} catch (error) {
		if (axios.isAxiosError(error)) {
			throw new Error(`Download failed: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Calculates file hashes for verification
 */
export function calculateFileHashes(buffer: Buffer): { sha256: string; md5: string; sha1: string } {
	return {
		sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
		md5: crypto.createHash('md5').update(buffer).digest('hex'),
		sha1: crypto.createHash('sha1').update(buffer).digest('hex')
	};
}

/**
 * Creates secure form data for file uploads
 */
export function createSecureFormData(buffer: Buffer, filename: string): FormData {
	const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
	const formData = new FormData();
	const blob = new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' });
	formData.append('file', blob, sanitizedFilename);
	return formData;
}

/**
 * Determines security status based on analysis results
 */
export function getSecurityStatus(stats: VirusTotalAnalysisStats): SecurityStatus {
	const malicious = stats.malicious || 0;
	const suspicious = stats.suspicious || 0;

	if (malicious > 0) {
		return STATUS_CONFIG.MALICIOUS;
	} else if (suspicious > 0) {
		return STATUS_CONFIG.SUSPICIOUS;
	}
	return STATUS_CONFIG.SAFE;
}

/**
 * Extracts malicious engine names from analysis results
 */
export function getMaliciousEngines(results: Record<string, VirusTotalEngineResult>, limit: number = 3): string[] {
	return Object.entries(results)
		.filter(([_, result]) => result.category === 'malicious')
		.map(([engine]) => engine)
		.slice(0, limit);
}

/**
 * Checks memory availability for file processing
 */
export function checkMemoryAvailability(fileSizeMB: number): boolean {
	const memoryUsage = process.memoryUsage();
	const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
	return memoryUsageMB + fileSizeMB <= VIRUSTOTAL_CONFIG.SECURITY.MAX_MEMORY_MB;
}

/**
 * Forces garbage collection if available
 */
export function forceGarbageCollection(): void {
	if (global.gc) {
		global.gc();
	}
}

/**
 * Creates progress display components
 */
export function createProgressComponents(
	title: string,
	resourceInfo: string,
	isExisting: boolean = false,
	expectedCompletionSeconds: number = 90
): ContainerBuilder[] {
	const expectedCompletion = Math.floor(Date.now() / 1000) + expectedCompletionSeconds;

	return [
		new ContainerBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`🔍 **${title}**\n\n` +
						resourceInfo +
						`\n\n${isExisting ? '📋 **Using existing analysis...** Resource already scanned.' : '⏳ **Scanning in progress...** Please wait while we analyze the resource.'}\n\n` +
						`Expected completion: <t:${expectedCompletion}:R>`
				)
			)
			.addMediaGalleryComponents(
				new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(VIRUSTOTAL_CONFIG.UI.PROGRESS_GIF_URL))
			)
	];
}

/**
 * Creates detailed text report
 */
export function createDetailedReport(
	headerTemplate: string,
	resourceInfo: Record<string, any>,
	analysisStats: VirusTotalAnalysisStats,
	analysisResults: Record<string, VirusTotalEngineResult>,
	additionalInfo: Record<string, any> = {}
): string {
	const maliciousEngines = getMaliciousEngines(analysisResults);

	const sections = [
		headerTemplate,
		REPORT_TEMPLATES.SEPARATOR,
		'',
		// Resource information
		Object.entries(resourceInfo)
			.map(([key, value]) => `${key.toUpperCase()}: ${value}`)
			.join('\n'),
		'',
		// Additional information
		Object.entries(additionalInfo)
			.map(([key, value]) => `${key.toUpperCase()}: ${value}`)
			.join('\n'),
		'',
		'DETECTION SUMMARY:',
		`- MALICIOUS: ${analysisStats.malicious || 0} engines`,
		`- SUSPICIOUS: ${analysisStats.suspicious || 0} engines`,
		`- CLEAN: ${analysisStats.harmless || 0} engines`,
		`- UNDETECTED: ${analysisStats.undetected || 0} engines`,
		analysisStats['type-unsupported'] ? `- TYPE UNSUPPORTED: ${analysisStats['type-unsupported']} engines` : '',
		'',
		'MALICIOUS DETECTIONS:',
		maliciousEngines.length > 0 ? maliciousEngines.map((engine) => `- ${engine}`).join('\n') : 'None detected',
		'',
		'DETAILED ANALYSIS RESULTS:',
		Object.entries(analysisResults)
			.map(([engine, result]) => `${engine}: ${result.category} (${result.result || 'N/A'})`)
			.join('\n'),
		'',
		REPORT_TEMPLATES.FOOTER(new Date().toISOString())
	].filter(Boolean);

	return sections.join('\n');
}

/**
 * Creates standard report components for VirusTotal results
 */
export function createReportComponents(
	title: string,
	status: SecurityStatus,
	sections: Array<{ title: string; content: string }>,
	webReportUrl: string,
	fileName: string
): ContainerBuilder[] {
	const builder = new ContainerBuilder()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
		.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`❓ **Security Status:** ${status.emoji} ${status.text}`));

	// Add each section with separators
	sections.forEach((section) => {
		builder
			.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${section.title}\n\n${section.content}`));
	});

	// Add file and web report button
	builder
		.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addFileComponents(new FileBuilder().setURL(`attachment://${fileName}`))
		.addActionRowComponents(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('View Web Report').setURL(webReportUrl)
			)
		);

	return [builder];
}

/**
 * Enhanced error handling for VirusTotal operations
 */
export function handleVirusTotalError(error: unknown, context: Record<string, any> = {}): string {
	// Use Logger instead of console.error
	const { Logger } = require('../../lib/logger');
	Logger.error('[SECURITY] VirusTotal operation error', error, context);

	if (axios.isAxiosError(error)) {
		const axiosError = error as AxiosError;

		switch (axiosError.response?.status) {
			case 429:
				return ERROR_MESSAGES.RATE_LIMIT_EXCEEDED;
			case 404:
				return '❌ Resource not found in VirusTotal database.';
			case 401:
			case 403:
				return ERROR_MESSAGES.API_KEY_MISSING;
			default:
				return ERROR_MESSAGES.GENERIC_ERROR;
		}
	}

	if (error instanceof Error) {
		if (error.message.includes('timeout')) {
			return '⏱️ Request timed out. Please try again later.';
		}

		if (error.message.includes('File too large')) {
			return error.message;
		}

		if (error.message.includes('Hash mismatch')) {
			return ERROR_MESSAGES.HASH_MISMATCH;
		}
	}

	return ERROR_MESSAGES.GENERIC_ERROR;
}

/**
 * Common function to fetch VirusTotal data for domains, IPs, or URLs
 */
export async function fetchVirusTotalData<T>(endpoint: string): Promise<T> {
	try {
		const apiKey = validateApiKey();
		if (!apiKey) {
			throw new Error(ERROR_MESSAGES.API_KEY_MISSING);
		}

		return await makeVirusTotalRequest<T>({
			method: 'GET',
			url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${endpoint}`,
			headers: {
				accept: 'application/json',
				'x-apikey': apiKey
			}
		});
	} catch (error) {
		throw error;
	}
}

/**
 * Common function to handle interaction deferral
 */
export async function deferInteractionReply(interaction: any, ephemeral: boolean): Promise<void> {
	await interaction.deferReply(ephemeral ? { flags: 1 << 6 } : undefined);
}

/**
 * Common function to format date from Unix timestamp
 */
export function formatUnixDate(timestamp: number | undefined): string {
	return timestamp ? new Date(timestamp * 1000).toLocaleDateString() : 'Unknown';
}
