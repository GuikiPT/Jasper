// Shared utilities for VirusTotal operations
import axios, { AxiosError } from 'axios';
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
import { Logger } from '../../../lib/logger';
// Transport/helpers are defined in the central service
export {
	validateApiKey,
	makeVirusTotalRequest,
	secureFileDownload,
	calculateFileHashes,
	createSecureFormData,
	checkMemoryAvailability,
	forceGarbageCollection
} from '../../../services/virusTotalService.js';

// Determine security status from analysis statistics
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

// Extract top malicious engine names from scan results
export function getMaliciousEngines(results: Record<string, VirusTotalEngineResult>, limit: number = 3): string[] {
	return Object.entries(results)
		.filter(([_, result]) => result.category === 'malicious')
		.map(([engine]) => engine)
		.slice(0, limit);
}

// Check if sufficient memory is available for file processing
// Create progress display components for scanning status
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

// Create detailed text report for download
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
		// Resource information section
		Object.entries(resourceInfo)
			.map(([key, value]) => `${key.toUpperCase()}: ${value}`)
			.join('\n'),
		'',
		// Additional metadata section
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

// Create standard Discord Components v2 for scan results
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

	// Add each information section with separator
	sections.forEach((section) => {
		builder
			.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${section.title}\n\n${section.content}`));
	});

	// Add downloadable report file and web report button
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

// Handle VirusTotal errors and return user-friendly messages
export function handleVirusTotalError(error: unknown, context: Record<string, any> = {}): string {
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

// Fetch data from VirusTotal API endpoint
// Format Unix timestamp to human-readable date
export function formatUnixDate(timestamp: number | undefined): string {
	return timestamp ? new Date(timestamp * 1000).toLocaleDateString() : 'Unknown';
}
