// Enhanced VirusTotal file analysis with improved architecture
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';

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

/**
 * Enhanced VirusTotal file analysis subcommand
 */
export async function chatInputVirusTotalFile(_command: Subcommand, interaction: VirusTotalChatInputInteraction) {
	const file = interaction.options.getAttachment('attachment', true);
	const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;

	await interaction.deferReply({ flags: isEphemeral ? MessageFlags.Ephemeral : [] });

	let fileBuffer: Buffer | null = null;
	let fileHashes: { sha256: string; md5: string; sha1: string } | null = null;

	try {
		// Validate file size
		const fileSizeMB = file.size / (1024 * 1024);
		if (fileSizeMB > VIRUSTOTAL_CONFIG.SECURITY.MAX_FILE_SIZE_MB) {
			await interaction.editReply({
				content: ERROR_MESSAGES.FILE_TOO_LARGE(fileSizeMB, VIRUSTOTAL_CONFIG.SECURITY.MAX_FILE_SIZE_MB)
			});
			return;
		}

		// Check memory availability
		if (!checkMemoryAvailability(fileSizeMB)) {
			await interaction.editReply({
				content: ERROR_MESSAGES.INSUFFICIENT_MEMORY
			});
			return;
		}

		// Determine upload URL for large files
		let uploadUrl = `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}`;
		if (fileSizeMB > VIRUSTOTAL_CONFIG.SECURITY.LARGE_FILE_THRESHOLD_MB) {
			const uploadUrlResponse = await makeVirusTotalRequest<{ data: string }>({
				method: 'GET',
				url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.UPLOAD_URL}`
			});
			uploadUrl = uploadUrlResponse.data;
		}

		// Download and hash file
		try {
			fileBuffer = await secureFileDownload(file.url, fileSizeMB);
		} catch (downloadError) {
			await interaction.editReply({
				content: ERROR_MESSAGES.DOWNLOAD_FAILED(downloadError instanceof Error ? downloadError.message : 'Unknown error')
			});
			return;
		}

		fileHashes = calculateFileHashes(fileBuffer);

		console.log(`[SECURITY] Processing file: ${file.name}, Size: ${fileSizeMB.toFixed(2)}MB, SHA256: ${fileHashes.sha256}`);

		// Check if file already exists in VirusTotal
		let analysisId: string = '';
		let skipUpload = false;

		try {
			const existingFileResponse = await makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
				method: 'GET',
				url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${fileHashes.sha256}`
			});

			if (existingFileResponse) {
				console.log(`[INFO] File already exists in VirusTotal: ${fileHashes.sha256}`);
				skipUpload = true;
				analysisId = fileHashes.sha256;
			}
		} catch (existingFileError) {
			console.log(`[INFO] File not found in VirusTotal, proceeding with upload: ${fileHashes.sha256}`);
		}

		// Show progress
		const progressComponents = createProgressComponents(
			'VirusTotal File Analysis',
			`Analyzing file: \`${file.name}\`\nSize: \`${fileSizeMB.toFixed(2)} MB\`\nSHA256: \`${fileHashes.sha256.substring(0, 16)}...\``,
			skipUpload,
			skipUpload ? 5 : 90
		);

		await interaction.editReply({
			components: progressComponents,
			flags: MessageFlags.IsComponentsV2
		});

		// Upload file if needed
		if (!skipUpload) {
			try {
				const formData = createSecureFormData(fileBuffer, file.name);

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

				analysisId = uploadResponse.data.id;
				console.log(`[INFO] File uploaded successfully: ${analysisId}`);
			} catch (uploadError) {
				// Handle conflict (409) - file already exists
				if (uploadError && typeof uploadError === 'object' && 'response' in uploadError) {
					const axiosError = uploadError as any;
					if (axiosError.response?.status === 409) {
						console.log(`[INFO] File upload conflict (409), using hash as ID: ${fileHashes.sha256}`);
						analysisId = fileHashes.sha256;
						skipUpload = true;
					} else {
						throw uploadError;
					}
				} else {
					throw uploadError;
				}
			}
		}

		// Clean up file buffer early
		fileBuffer = null;
		forceGarbageCollection();

		console.log(`[INFO] Analysis ID: ${analysisId}`);

		// Wait for analysis completion
		const waitTime = skipUpload ? VIRUSTOTAL_CONFIG.TIMING.ANALYSIS_WAIT_EXISTING_MS : VIRUSTOTAL_CONFIG.TIMING.ANALYSIS_WAIT_NEW_MS;
		await new Promise((resolve) => setTimeout(resolve, waitTime));

		// Get analysis results
		let analysisData: VirusTotalApiResponse<VirusTotalFileAttributes>;

		if (skipUpload) {
			analysisData = await makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
				method: 'GET',
				url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${analysisId}`
			});
		} else {
			// Check analysis status first
			const analysisStatusResponse = await makeVirusTotalRequest<VirusTotalAnalysisResponse>({
				method: 'GET',
				url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.ANALYSES}/${analysisId}`
			});

			if (analysisStatusResponse.data.attributes.status !== 'completed') {
				await interaction.editReply({
					content: ERROR_MESSAGES.ANALYSIS_IN_PROGRESS
				});
				return;
			}

			const fileId = analysisStatusResponse.data.meta.file_info.sha256;

			analysisData = await makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
				method: 'GET',
				url: `${VIRUSTOTAL_CONFIG.API.BASE_URL}${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${fileId}`
			});
		}

		// Verify file integrity if hash verification is enabled
		if (VIRUSTOTAL_CONFIG.SECURITY.HASH_VERIFICATION && fileHashes && analysisData.data.attributes.sha256) {
			if (analysisData.data.attributes.sha256 !== fileHashes.sha256) {
				console.warn('[SECURITY] Hash mismatch detected:', {
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

		// Process results
		const attributes = analysisData.data.attributes;
		const stats = attributes.last_analysis_stats;
		const results = attributes.last_analysis_results;
		const status = getSecurityStatus(stats);

		const lastAnalysisDate = attributes.last_analysis_date ? new Date(attributes.last_analysis_date * 1000).toLocaleDateString() : 'Unknown';

		// Create detailed report
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

		// Create report sections
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

		// Create and send response
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
		// Cleanup
		fileBuffer = null;
		fileHashes = null;
		forceGarbageCollection();
	}
}
