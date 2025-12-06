import axios from 'axios';
import crypto from 'crypto';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import {
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	FileBuilder,
	ContainerBuilder,
	MessageFlags,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	type MessageActionRowComponentBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder
} from 'discord.js';

import { VirusTotalChatInputInteraction } from './types';
import { Logger } from '../../../lib/logger';

const SECURITY_CONFIG = {
	DOWNLOAD_TIMEOUT_MS: 60000,
	MAX_MEMORY_MB: 1024,
	MAX_CONCURRENT_SCANS: 3,
	MAX_RETRIES: 3,
	RETRY_DELAY_MS: 2000
};

async function secureFileDownload(fileUrl: string, maxSizeMB: number): Promise<Buffer> {
	const maxSizeBytes = maxSizeMB * 1024 * 1024;

	try {
		const response = await axios({
			method: 'GET',
			url: fileUrl,
			responseType: 'stream',
			timeout: SECURITY_CONFIG.DOWNLOAD_TIMEOUT_MS,
			maxRedirects: 0,
			validateStatus: (status) => status === 200,
			headers: {
				'User-Agent': 'Jasper-Bot-VirusTotal-Scanner/1.0'
			}
		});

		const chunks: Buffer[] = [];
		let totalSize = 0;

		return new Promise((resolve, reject) => {
			response.data.on('data', (chunk: Buffer) => {
				totalSize += chunk.length;

				if (totalSize > maxSizeBytes) {
					response.data.destroy();
					reject(new Error(`File too large: ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds ${maxSizeMB}MB limit`));
					return;
				}

				chunks.push(chunk);
			});

			response.data.on('end', () => {
				try {
					const buffer = Buffer.concat(chunks);
					chunks.length = 0;
					resolve(buffer);
				} catch (error) {
					reject(new Error('Failed to concatenate file chunks'));
				}
			});

			response.data.on('error', (error: Error) => {
				reject(new Error(`Download failed: ${error.message}`));
			});

			setTimeout(() => {
				response.data.destroy();
				reject(new Error('Download timeout exceeded'));
			}, SECURITY_CONFIG.DOWNLOAD_TIMEOUT_MS);
		});
	} catch (error) {
		if (axios.isAxiosError(error)) {
			throw new Error(`Download failed: ${error.message}`);
		}
		throw error;
	}
}

function calculateFileHash(buffer: Buffer): { sha256: string; md5: string } {
	const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
	const md5 = crypto.createHash('md5').update(buffer).digest('hex');
	return { sha256, md5 };
}

function createSecureFormData(buffer: Buffer, filename: string): FormData {
	const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

	const formData = new FormData();
	const uint8Array = new Uint8Array(buffer);
	const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
	formData.append('file', blob, sanitizedFilename);

	return formData;
}

export async function chatInputVirusTotalFile(_command: Subcommand, interaction: VirusTotalChatInputInteraction) {
	const file = interaction.options.getAttachment('attachment', true);
	const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;

	await interaction.deferReply({ flags: isEphemeral ? MessageFlags.Ephemeral : [] });

	let fileBuffer: Buffer | null = null;
	let fileHashes: { sha256: string; md5: string } | null = null;

	try {
		const apiKey = process.env.VIRUSTOTAL_API_KEY;
		if (!apiKey) {
			await interaction.editReply({
				content: '❌ VirusTotal API key is not configured. Please contact an administrator.'
			});
			return;
		}

		const fileSizeMB = file.size / (1024 * 1024);
		if (fileSizeMB > 650) {
			await interaction.editReply({
				content: '❌ File is too large. Maximum file size is 650MB.'
			});
			return;
		}

		const memoryUsage = process.memoryUsage();
		const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
		if (memoryUsageMB + fileSizeMB > SECURITY_CONFIG.MAX_MEMORY_MB) {
			await interaction.editReply({
				content: '❌ Insufficient memory available to process this file safely. Please try again later.'
			});
			return;
		}

		let uploadUrl = 'https://www.virustotal.com/api/v3/files';
		if (fileSizeMB > 32) {
			const uploadUrlOptions = {
				method: 'GET',
				url: 'https://www.virustotal.com/api/v3/files/upload_url',
				headers: {
					accept: 'application/json',
					'x-apikey': apiKey
				},
				timeout: 10000
			};

			const uploadUrlResponse = await axios.request(uploadUrlOptions);
			uploadUrl = uploadUrlResponse.data.data;
		}

		try {
			fileBuffer = await secureFileDownload(file.url, fileSizeMB);
		} catch (downloadError) {
			await interaction.editReply({
				content: `❌ Failed to securely download file: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`
			});
			return;
		}

		fileHashes = calculateFileHash(fileBuffer);

		console.log(`[SECURITY] Processing file: ${file.name}, Size: ${fileSizeMB.toFixed(2)}MB, SHA256: ${fileHashes.sha256}`);

		let analysisId: string = '';
		let skipUpload = false;

		try {
			const existingFileOptions = {
				method: 'GET',
				url: `https://www.virustotal.com/api/v3/files/${fileHashes.sha256}`,
				headers: {
					accept: 'application/json',
					'x-apikey': apiKey
				},
				timeout: 10000
			};

			const existingFileResponse = await axios.request(existingFileOptions);

			if (existingFileResponse.status === 200) {
				console.log(`[INFO] File already exists in VirusTotal: ${fileHashes.sha256}`);
				skipUpload = true;
				analysisId = fileHashes.sha256;
			}
		} catch (existingFileError) {
			console.log(`[INFO] File not found in VirusTotal, proceeding with upload: ${fileHashes.sha256}`);
		}

		const expectedCompletion = Math.floor(Date.now() / 1000) + (skipUpload ? 5 : 90);
		const progressComponents = [
			new ContainerBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`🔍 **VirusTotal File Analysis**\n\n` +
						`Analyzing file: \`${file.name}\`\n` +
						`Size: \`${fileSizeMB.toFixed(2)} MB\`\n` +
						`SHA256: \`${fileHashes.sha256.substring(0, 16)}...\`\n\n` +
						`${skipUpload ? '📋 **Using existing analysis...** File already scanned.' : '⏳ **Scanning in progress...** Please wait while we analyze the file.'}\n\n` +
						`Expected completion: <t:${expectedCompletion}:R>`
					)
				)
				.addMediaGalleryComponents(
					new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('https://i.imgur.com/OuNrmUW.gif'))
				)
		];

		await interaction.editReply({
			components: progressComponents,
			flags: MessageFlags.IsComponentsV2
		});

		if (!skipUpload) {
			try {
				const formData = createSecureFormData(fileBuffer, file.name);

				const uploadOptions = {
					method: 'POST',
					url: uploadUrl,
					headers: {
						accept: 'application/json',
						'x-apikey': apiKey
					},
					data: formData,
					timeout: SECURITY_CONFIG.DOWNLOAD_TIMEOUT_MS,
					maxBodyLength: fileSizeMB * 1024 * 1024 * 2
				};

				const uploadResponse = await axios.request(uploadOptions);
				analysisId = uploadResponse.data.data.id;

				console.log(`[INFO] File uploaded successfully: ${analysisId}`);
			} catch (uploadError) {
				if (axios.isAxiosError(uploadError) && uploadError.response?.status === 409) {
					console.log(`[INFO] File upload conflict (409), using hash as ID: ${fileHashes.sha256}`);
					analysisId = fileHashes.sha256;
					skipUpload = true;
				} else {
					throw uploadError;
				}
			}
		}

		fileBuffer = null;
		if (global.gc) {
			global.gc();
		}

		console.log(`[INFO] Analysis ID: ${analysisId}`);

		const waitTime = skipUpload ? 5000 : 90000;
		await new Promise((resolve) => setTimeout(resolve, waitTime));

		let analysisData;

		if (skipUpload) {
			const fileReportOptions = {
				method: 'GET',
				url: `https://www.virustotal.com/api/v3/files/${analysisId}`,
				headers: {
					accept: 'application/json',
					'x-apikey': apiKey
				},
				timeout: 15000
			};

			const analysisResponse = await axios.request(fileReportOptions);
			analysisData = analysisResponse.data;
		} else {
			const analysisStatusOptions = {
				method: 'GET',
				url: `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
				headers: {
					accept: 'application/json',
					'x-apikey': apiKey
				},
				timeout: 15000
			};

			const analysisStatusResponse = await axios.request(analysisStatusOptions);
			const analysisStatus = analysisStatusResponse.data;

			if (analysisStatus.data.attributes.status !== 'completed') {
				await interaction.editReply({
					content: '⏳ Analysis is still in progress. Please try again in a few minutes.'
				});
				return;
			}

			const fileId = analysisStatus.data.meta.file_info.sha256;

			const fileReportOptions = {
				method: 'GET',
				url: `https://www.virustotal.com/api/v3/files/${fileId}`,
				headers: {
					accept: 'application/json',
					'x-apikey': apiKey
				},
				timeout: 15000
			};

			const analysisResponse = await axios.request(fileReportOptions);
			analysisData = analysisResponse.data;
		}

		const attributes = analysisData.data.attributes;
		const stats = attributes.last_analysis_stats;
		const results = attributes.last_analysis_results;
		const fileInfo = attributes;

		if (fileHashes && fileInfo.sha256 && fileInfo.sha256 !== fileHashes.sha256) {
			console.warn('[SECURITY] Hash mismatch detected:', {
				expected: fileHashes.sha256,
				received: fileInfo.sha256,
				filename: file.name
			});
			await interaction.editReply({
				content: '⚠️ File integrity verification failed. The file may have been corrupted during transfer.'
			});
			return;
		}

		const malicious = stats.malicious || 0;
		const suspicious = stats.suspicious || 0;
		const harmless = stats.harmless || 0;
		const undetected = stats.undetected || 0;
		const typeUnsupported = stats['type-unsupported'] || 0;

		let status = '🟢 **SAFE**';
		if (malicious > 0) {
			status = '🔴 **MALICIOUS**';
		} else if (suspicious > 0) {
			status = '🟡 **SUSPICIOUS**';
		}

		const lastAnalysisDate = attributes.last_analysis_date ? new Date(attributes.last_analysis_date * 1000).toLocaleDateString() : 'Unknown';

		const maliciousEngines = Object.entries(results)
			.filter(([_, result]: [string, any]) => result.category === 'malicious')
			.map(([engine]) => `${engine}`)
			.slice(0, 3);

		const detailedReport = `
VIRUSTOTAL FILE ANALYSIS REPORT
==============================

FILE: ${file.name}
SIZE: ${fileSizeMB.toFixed(2)} MB

HASHES:
- SHA256: ${fileInfo.sha256 || 'Unknown'}
- MD5: ${fileInfo.md5 || 'Unknown'}
- SHA1: ${fileInfo.sha1 || 'Unknown'}

LAST ANALYSIS DATE: ${lastAnalysisDate}

DETECTION SUMMARY:
- MALICIOUS: ${malicious} engines
- SUSPICIOUS: ${suspicious} engines
- CLEAN: ${harmless} engines
- UNDETECTED: ${undetected} engines
- TYPE UNSUPPORTED: ${typeUnsupported} engines

MALICIOUS DETECTIONS:
${maliciousEngines.length > 0 ? maliciousEngines.map((engine) => `- ${engine}`).join('\n') : 'None detected'}

DETAILED ANALYSIS RESULTS:
${Object.entries(results)
				.map(([engine, result]: [string, any]) => `${engine}: ${result.category} (${result.result || 'N/A'})`)
				.join('\n')}

Generated by Jasper Bot - ${new Date().toISOString()}
Powered by VirusTotal API
		`.trim();

		const components = [
			new ContainerBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent('## VirusTotal File Report'))
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

				.addTextDisplayComponents(new TextDisplayBuilder().setContent(`❓ **Security Status:** ${status}`))
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`📁 **File Information**\n\n` +
						`• **Name:** \`${file.name}\`\n` +
						`• **Size:** \`${fileSizeMB.toFixed(2)} MB\`\n` +
						`• **SHA256:** \`${fileInfo.sha256 || 'Unknown'}\`\n` +
						`• **MD5:** \`${fileInfo.md5 || 'Unknown'}\`\n` +
						`• **SHA1:** \`${fileInfo.sha1 || 'Unknown'}\``
					)
				)
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`📈 **Detection Summary:**\n\n` +
						`• **Malicious:** \`${malicious}\` engines\n` +
						`• **Suspicious:** \`${suspicious}\` engines\n` +
						`• **Clean:** \`${harmless}\` engines\n` +
						`• **Undetected:** \`${undetected}\` engines\n` +
						`• **Type Unsupported:** \`${typeUnsupported}\` engines`
					)
				)
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`📅 **Last Analyzed:**\n` + `\`${lastAnalysisDate}\`\n\n` + `🔄 **Analysis ID:**\n` + `\`${analysisId}\``
					)
				)
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

				.addFileComponents(new FileBuilder().setURL(`attachment://virustotal-file-report.txt`))

				.addActionRowComponents(
					new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
						new ButtonBuilder()
							.setStyle(ButtonStyle.Link)
							.setLabel('View Web Report')
							.setURL(`https://www.virustotal.com/gui/file/${fileInfo.sha256}`)
					)
				)
		];

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
		fileBuffer = null;
		fileHashes = null;

		if (global.gc) {
			global.gc();
		}

		Logger.error('[SECURITY] VirusTotal API error', error, {
			guildId: interaction.guildId,
			userId: interaction.user.id,
			filename: file.name,
			fileSize: file.size
		});

		await interaction.editReply({
			content: '❌ An error occurred while analyzing the file. Please try again later or contact support if the issue persists.'
		});
	} finally {
		fileBuffer = null;
		fileHashes = null;

		if (global.gc) {
			global.gc();
		}
	}
}
