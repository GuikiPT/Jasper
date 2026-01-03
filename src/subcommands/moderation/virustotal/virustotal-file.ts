// VirusTotal file analysis subcommand with secure upload and scanning
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import { container } from '@sapphire/pieces';

import {
	makeVirusTotalRequest,
	secureFileDownload,
	calculateFileHashes,
	createSecureFormData,
	getSecurityStatus,
	checkMemoryAvailability,
	forceGarbageCollection,
	createProgressComponents,
	createDetailedReport,
	createReportComponents,
	handleVirusTotalError
} from './utils';
import { VIRUSTOTAL_CONFIG, ERROR_MESSAGES, REPORT_TEMPLATES } from './constants';
import type {
	VirusTotalChatInputInteraction,
	VirusTotalFileAttributes,
	VirusTotalApiResponse,
	VirusTotalUploadResponse,
	VirusTotalAnalysisResponse
} from './types';

// Handle /virustotal file subcommand: upload and scan file for malware
export async function chatInputVirusTotalFile(_command: Subcommand, interaction: VirusTotalChatInputInteraction) {
	const file = interaction.options.getAttachment('attachment', true);
	const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;

	await interaction.deferReply({ flags: isEphemeral ? MessageFlags.Ephemeral : [] });

	let fileBuffer: Buffer | null = null;
	let fileHashes: { sha256: string; md5: string; sha1: string } | null = null;

	try {
		// Validate file size constraints
		const fileSizeMB = file.size / (1024 * 1024);
		if (fileSizeMB > VIRUSTOTAL_CONFIG.SECURITY.MAX_FILE_SIZE_MB) {
			await interaction.editReply({
				content: ERROR_MESSAGES.FILE_TOO_LARGE(fileSizeMB, VIRUSTOTAL_CONFIG.SECURITY.MAX_FILE_SIZE_MB)
			});
			return;
		}

		// Check available memory before processing
		if (!checkMemoryAvailability(fileSizeMB)) {
			await interaction.editReply({
				content: ERROR_MESSAGES.INSUFFICIENT_MEMORY
			});
			return;
		}

		// Get appropriate upload URL for file size
		const uploadUrl = await getUploadUrl(fileSizeMB);

		// Download file from Discord and calculate hashes
		try {
			fileBuffer = await secureFileDownload(file.url, fileSizeMB);
		} catch (downloadError) {
			await interaction.editReply({
				content: ERROR_MESSAGES.DOWNLOAD_FAILED(downloadError instanceof Error ? downloadError.message : 'Unknown error')
			});
			return;
		}

		fileHashes = calculateFileHashes(fileBuffer);

		container.logger.info(`[SECURITY] Processing file: ${file.name}, Size: ${fileSizeMB.toFixed(2)}MB, SHA256: ${fileHashes.sha256}`);

		// Check if file already scanned by VirusTotal
		const { analysisId, skipUpload } = await checkExistingFile(fileHashes.sha256);

		// Show progress indicator to user
		await showProgress(interaction, file.name, fileSizeMB, fileHashes.sha256, skipUpload);

		// Upload file if not already in VirusTotal database
		const finalAnalysisId = skipUpload ? analysisId : await uploadFile(fileBuffer, file.name, uploadUrl, fileSizeMB, fileHashes.sha256);

		// Clean up file buffer early to free memory
		fileBuffer = null;
		forceGarbageCollection();

		container.logger.info(`[INFO] Analysis ID: ${finalAnalysisId}`);

		// Wait for analysis to complete
		await waitForAnalysis(skipUpload);

		// Fetch analysis results
		const analysisData = await fetchAnalysisResults(finalAnalysisId, skipUpload);

		// Verify file integrity
		if (VIRUSTOTAL_CONFIG.SECURITY.HASH_VERIFICATION && fileHashes && analysisData.data.attributes.sha256) {
			if (analysisData.data.attributes.sha256 !== fileHashes.sha256) {
				container.logger.warn('[SECURITY] Hash mismatch detected:', {
					expected: fileHashes.sha256,
					received: analysisData.data.attributes.sha256,
					filename: file.name
				});
				await interaction.editReply({
					content: ERROR_MESSAGES.HASH_MISMATCH
				});
				return;
			}
		}

		// Build and send report
		await sendAnalysisReport(interaction, file, fileSizeMB, analysisData, finalAnalysisId);
	} catch (error) {
		const errorMessage = handleVirusTotalError(error, {
			guildId: interaction.guildId,
			userId: interaction.user.id,
			filename: file.name,
			fileSize: file.size
		});

		await interaction.editReply({
			content: errorMessage
		});
	} finally {
		// Clean up memory
		fileBuffer = null;
		fileHashes = null;
		forceGarbageCollection();
	}
}

// Get appropriate upload URL based on file size
async function getUploadUrl(fileSizeMB: number): Promise<string> {
	if (fileSizeMB <= VIRUSTOTAL_CONFIG.SECURITY.LARGE_FILE_THRESHOLD_MB) {
		return `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}`;
	}

	const uploadUrlResponse = await makeVirusTotalRequest<{ data: string }>({
		method: 'GET',
		url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.UPLOAD_URL}`
	});

	return uploadUrlResponse.data;
}

// Check if file already exists in VirusTotal database
async function checkExistingFile(sha256: string): Promise<{ analysisId: string; skipUpload: boolean }> {
	try {
		const existingFileResponse = await makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
			method: 'GET',
			url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${sha256}`
		});

		if (existingFileResponse) {
			container.logger.info(`[INFO] File already exists in VirusTotal: ${sha256}`);
			return { analysisId: sha256, skipUpload: true };
		}
	} catch (existingFileError) {
		container.logger.info(`[INFO] File not found in VirusTotal, proceeding with upload: ${sha256}`);
	}

	return { analysisId: '', skipUpload: false };
}

// Show progress indicator during analysis
async function showProgress(
	interaction: VirusTotalChatInputInteraction,
	filename: string,
	fileSizeMB: number,
	sha256: string,
	skipUpload: boolean
): Promise<void> {
	const progressComponents = createProgressComponents(
		'VirusTotal File Analysis',
		`Analyzing file: \`${filename}\`\nSize: \`${fileSizeMB.toFixed(2)} MB\`\nSHA256: \`${sha256.substring(0, 16)}...\``,
		skipUpload,
		skipUpload ? 5 : 90
	);

	await interaction.editReply({
		components: progressComponents,
		flags: MessageFlags.IsComponentsV2
	});
}

// Upload file to VirusTotal
async function uploadFile(fileBuffer: Buffer, filename: string, uploadUrl: string, fileSizeMB: number, sha256: string): Promise<string> {
	try {
		const formData = createSecureFormData(fileBuffer, filename);

		const uploadResponse = await makeVirusTotalRequest<VirusTotalUploadResponse>({
			method: 'POST',
			url: uploadUrl,
			headers: {
				'content-type': 'multipart/form-data'
			},
			data: formData,
			timeout: VIRUSTOTAL_CONFIG.SECURITY.DOWNLOAD_TIMEOUT_MS,
			maxBodyLength: fileSizeMB * 1024 * 1024 * 2
		});

		container.logger.info(`[INFO] File uploaded successfully: ${uploadResponse.data.id}`);
		return uploadResponse.data.id;
	} catch (uploadError) {
		// Handle 409 conflict - file already exists
		if (uploadError && typeof uploadError === 'object' && 'response' in uploadError) {
			const axiosError = uploadError as any;
			if (axiosError.response?.status === 409) {
				container.logger.info(`[INFO] File upload conflict (409), using hash as ID: ${sha256}`);
				return sha256;
			}
		}
		throw uploadError;
	}
}

// Wait for analysis to complete based on upload status
async function waitForAnalysis(skipUpload: boolean): Promise<void> {
	const waitTime = skipUpload ? VIRUSTOTAL_CONFIG.TIMING.ANALYSIS_WAIT_EXISTING_MS : VIRUSTOTAL_CONFIG.TIMING.ANALYSIS_WAIT_NEW_MS;
	await new Promise((resolve) => setTimeout(resolve, waitTime));
}

// Fetch analysis results from VirusTotal
async function fetchAnalysisResults(analysisId: string, skipUpload: boolean): Promise<VirusTotalApiResponse<VirusTotalFileAttributes>> {
	if (skipUpload) {
		// File already existed, fetch directly
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
			method: 'GET',
			url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${analysisId}`
		});
	}

	// Check analysis status first for new uploads
	const analysisStatusResponse = await makeVirusTotalRequest<VirusTotalAnalysisResponse>({
		method: 'GET',
		url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.ANALYSES}/${analysisId}`
	});

	if (analysisStatusResponse.data.attributes.status !== 'completed') {
		throw new Error(ERROR_MESSAGES.ANALYSIS_IN_PROGRESS);
	}

	const fileId = analysisStatusResponse.data.meta.file_info.sha256;

	return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
		method: 'GET',
		url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${fileId}`
	});
}

// Build and send analysis report to user
async function sendAnalysisReport(
	interaction: VirusTotalChatInputInteraction,
	file: any,
	fileSizeMB: number,
	analysisData: VirusTotalApiResponse<VirusTotalFileAttributes>,
	analysisId: string
): Promise<void> {
	const attributes = analysisData.data.attributes;
	const stats = attributes.last_analysis_stats;
	const results = attributes.last_analysis_results;
	const status = getSecurityStatus(stats);

	const lastAnalysisDate = attributes.last_analysis_date ? new Date(attributes.last_analysis_date * 1000).toLocaleDateString() : 'Unknown';

	// Create detailed text report
	const detailedReport = createDetailedReport(
		REPORT_TEMPLATES.FILE_HEADER,
		{
			File: file.name,
			Size: `${fileSizeMB.toFixed(2)} MB`
		},
		stats,
		results,
		{
			SHA256: attributes.sha256 || 'Unknown',
			MD5: attributes.md5 || 'Unknown',
			SHA1: attributes.sha1 || 'Unknown',
			'Last Analysis Date': lastAnalysisDate
		}
	);

	// Build report sections for Discord display
	const reportSections = [
		{
			title: '📁 **File Information**',
			content: [
				`• **Name:** \`${file.name}\``,
				`• **Size:** \`${fileSizeMB.toFixed(2)} MB\``,
				`• **SHA256:** \`${attributes.sha256 || 'Unknown'}\``,
				`• **MD5:** \`${attributes.md5 || 'Unknown'}\``,
				`• **SHA1:** \`${attributes.sha1 || 'Unknown'}\``
			].join('\n')
		},
		{
			title: '📈 **Detection Summary**',
			content: [
				`• **Malicious:** \`${stats.malicious || 0}\` engines`,
				`• **Suspicious:** \`${stats.suspicious || 0}\` engines`,
				`• **Clean:** \`${stats.harmless || 0}\` engines`,
				`• **Undetected:** \`${stats.undetected || 0}\` engines`,
				stats['type-unsupported'] ? `• **Type Unsupported:** \`${stats['type-unsupported']}\` engines` : null
			]
				.filter(Boolean)
				.join('\n')
		},
		{
			title: '📅 **Analysis Information**',
			content: [
				`**Last Analyzed:** \`${lastAnalysisDate}\``,
				`**Analysis ID:** \`${analysisId}\``,
				`**Times Submitted:** \`${attributes.times_submitted || 1}\``,
				`**Reputation:** \`${attributes.reputation || 0}/100\``
			].join('\n\n')
		}
	];

	// Create Components v2 display
	const components = createReportComponents(
		'VirusTotal File Report',
		status,
		reportSections,
		`${VIRUSTOTAL_CONFIG.UI.WEB_REPORT_BASE_URL}/file/${attributes.sha256}`,
		`virustotal-file-report.txt`
	);

	await interaction.editReply({
		files: [
			{
				attachment: Buffer.from(detailedReport),
				name: `virustotal-file-report.txt`
			}
		],
		components,
		flags: MessageFlags.IsComponentsV2
	});
}
