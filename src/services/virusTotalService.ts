import axios, { type AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { VIRUSTOTAL_CONFIG } from '../subcommands/moderation/virustotal/constants.js';
import type {
	VirusTotalApiResponse,
	VirusTotalAnalysisResponse,
	VirusTotalFileAttributes,
	VirusTotalIpAttributes,
	VirusTotalUrlAttributes,
	VirusTotalUploadResponse
} from '../subcommands/moderation/virustotal/types.js';

// Lightweight rate limiter to respect VirusTotal public limits
class RateLimiter {
	private requests: number[] = [];
	constructor(private readonly maxRequests = VIRUSTOTAL_CONFIG.API.RATE_LIMITS.PUBLIC.REQUESTS_PER_MINUTE, private readonly windowMs = 60000) { }

	async wait(): Promise<void> {
		const now = Date.now();
		this.requests = this.requests.filter((time) => now - time < this.windowMs);
		if (this.requests.length >= this.maxRequests) {
			const oldest = Math.min(...this.requests);
			const wait = this.windowMs - (now - oldest);
			if (wait > 0) {
				await new Promise((resolve) => setTimeout(resolve, wait));
			}
		}
		this.requests.push(now);
	}
}

const rateLimiter = new RateLimiter();

// Validate API key is configured in environment
export function validateApiKey(): string {
	const apiKey = process.env.VIRUSTOTAL_API_KEY;
	if (!apiKey) {
		throw new Error('❌ VirusTotal API key is not configured. Please contact an administrator.');
	}
	return apiKey;
}

// Make rate-limited request to VirusTotal API with retry logic
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
				if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
					if (error.response.status === 429) {
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

// Securely download file with size validation and streaming
export async function secureFileDownload(fileUrl: string, maxSizeMB: number): Promise<Buffer> {
	const maxSizeBytes = maxSizeMB * 1024 * 1024;

	try {
		new URL(fileUrl);
	} catch {
		throw new Error('❌ Invalid URL format provided.');
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
					chunks.length = 0;
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

// Calculate SHA-256, MD5, and SHA-1 hashes for file verification
export function calculateFileHashes(buffer: Buffer): { sha256: string; md5: string; sha1: string } {
	return {
		sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
		md5: crypto.createHash('md5').update(buffer).digest('hex'),
		sha1: crypto.createHash('sha1').update(buffer).digest('hex')
	};
}

// Create sanitized FormData for file upload
export function createSecureFormData(buffer: Buffer, filename: string): FormData {
	const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
	const formData = new FormData();
	const blob = new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' });
	formData.append('file', blob, sanitizedFilename);
	return formData;
}

// Check if sufficient memory is available for file processing
export function checkMemoryAvailability(fileSizeMB: number): boolean {
	const memoryUsage = process.memoryUsage();
	const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
	return memoryUsageMB + fileSizeMB <= VIRUSTOTAL_CONFIG.SECURITY.MAX_MEMORY_MB;
}

// Force garbage collection if --expose-gc flag is set
export function forceGarbageCollection(): void {
	if (global.gc) {
		global.gc();
	}
}

// Centralized service for VirusTotal API interactions (IPs, domains, URLs, files)
export class VirusTotalService {
	private readonly baseUrl = VIRUSTOTAL_CONFIG.API.BASE_URL;

	// Build full API endpoint URL from path
	private buildUrl(path: string): string {
		return `${this.baseUrl}${path}`;
	}

	// Sleep utility for rate limiting and analysis delays
	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// Convert URL to base64url identifier for VirusTotal API
	public getUrlId(link: string): string {
		return Buffer.from(link).toString('base64url');
	}

	// Validate and retrieve API key from environment
	public ensureApiKey(): string {
		return validateApiKey();
	}

	// Fetch IP address reputation and security analysis
	public async fetchIp(address: string): Promise<VirusTotalApiResponse<VirusTotalIpAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalIpAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.IP_ADDRESSES}/${address}`)
		});
	}

	// Fetch domain reputation and security analysis
	public async fetchDomain(name: string): Promise<VirusTotalApiResponse<any>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<any>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.DOMAINS}/${name}`)
		});
	}

	// Submit URL to VirusTotal for scanning
	public async submitUrl(link: string): Promise<void> {
		const apiKey = this.ensureApiKey();
		await makeVirusTotalRequest({
			method: 'POST',
			url: this.buildUrl(VIRUSTOTAL_CONFIG.API.ENDPOINTS.URLS),
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'x-apikey': apiKey
			},
			data: `url=${encodeURIComponent(link)}`
		});
	}

	// Submit URL and fetch scan results after waiting for analysis
	public async fetchUrlReport(link: string, waitMs: number = 30000): Promise<VirusTotalApiResponse<VirusTotalUrlAttributes>> {
		await this.submitUrl(link);
		await this.sleep(waitMs);

		const urlId = this.getUrlId(link);
		return this.fetchUrlById(urlId);
	}

	// Fetch URL scan report by its base64url ID
	public async fetchUrlById(urlId: string): Promise<VirusTotalApiResponse<VirusTotalUrlAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalUrlAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.URLS}/${urlId}`)
		});
	}

	// Request presigned upload URL for large files (>32MB)
	public async getUploadUrl(): Promise<string> {
		const response = await makeVirusTotalRequest<{ data: string }>({
			method: 'GET',
			url: this.buildUrl(VIRUSTOTAL_CONFIG.API.ENDPOINTS.UPLOAD_URL)
		});
		return response.data;
	}

	// Fetch existing file scan report by hash (SHA-256, SHA-1, or MD5)
	public async fetchExistingFile(hash: string): Promise<VirusTotalApiResponse<VirusTotalFileAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${hash}`)
		});
	}

	// Upload file to VirusTotal for malware scanning
	public async uploadFile(formData: FormData, uploadUrl?: string, sizeMB?: number): Promise<VirusTotalUploadResponse> {
		const apiKey = this.ensureApiKey();
		return makeVirusTotalRequest<VirusTotalUploadResponse>({
			method: 'POST',
			url: uploadUrl ?? this.buildUrl(VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES),
			headers: {
				'content-type': 'multipart/form-data',
				'x-apikey': apiKey
			},
			data: formData,
			// Dynamic timeout and size limits based on file size
			timeout: sizeMB ? sizeMB * 1024 * 1024 * 2 : undefined,
			maxBodyLength: sizeMB ? sizeMB * 1024 * 1024 * 2 : undefined
		});
	}

	// Fetch analysis status and results by analysis ID
	public async fetchAnalysis(analysisId: string): Promise<VirusTotalAnalysisResponse> {
		return makeVirusTotalRequest<VirusTotalAnalysisResponse>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.ANALYSES}/${analysisId}`)
		});
	}

	// Fetch file scan report by file ID (returned from upload)
	public async fetchFileReport(fileId: string): Promise<VirusTotalApiResponse<VirusTotalFileAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${fileId}`)
		});
	}
}

// Augment Sapphire container with VirusTotal service instance
declare module '@sapphire/pieces' {
	interface Container {
		virusTotalService: VirusTotalService;
	}
}
