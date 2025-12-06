import { VIRUSTOTAL_CONFIG } from '../subcommands/moderation/virustotal/constants.js';
import {
	makeVirusTotalRequest,
	validateApiKey
} from '../subcommands/moderation/virustotal/utils.js';
import type {
	VirusTotalApiResponse,
	VirusTotalAnalysisResponse,
	VirusTotalFileAttributes,
	VirusTotalIpAttributes,
	VirusTotalUrlAttributes,
	VirusTotalUploadResponse
} from '../subcommands/moderation/virustotal/types.js';

// Centralized VirusTotal API client
export class VirusTotalService {
	private readonly baseUrl = VIRUSTOTAL_CONFIG.API.BASE_URL;

	private buildUrl(path: string): string {
		return `${this.baseUrl}${path}`;
	}

	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	public getUrlId(link: string): string {
		return Buffer.from(link).toString('base64url');
	}

	public ensureApiKey(): string {
		return validateApiKey();
	}

	public async fetchIp(address: string): Promise<VirusTotalApiResponse<VirusTotalIpAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalIpAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.IP_ADDRESSES}/${address}`)
		});
	}

	public async fetchDomain(name: string): Promise<VirusTotalApiResponse<any>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<any>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.DOMAINS}/${name}`)
		});
	}

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

	public async fetchUrlReport(link: string, waitMs: number = 30000): Promise<VirusTotalApiResponse<VirusTotalUrlAttributes>> {
		await this.submitUrl(link);
		await this.sleep(waitMs);

		const urlId = this.getUrlId(link);
		return this.fetchUrlById(urlId);
	}

	public async fetchUrlById(urlId: string): Promise<VirusTotalApiResponse<VirusTotalUrlAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalUrlAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.URLS}/${urlId}`)
		});
	}

	public async getUploadUrl(): Promise<string> {
		const response = await makeVirusTotalRequest<{ data: string }>({
			method: 'GET',
			url: this.buildUrl(VIRUSTOTAL_CONFIG.API.ENDPOINTS.UPLOAD_URL)
		});
		return response.data;
	}

	public async fetchExistingFile(hash: string): Promise<VirusTotalApiResponse<VirusTotalFileAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${hash}`)
		});
	}

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
			timeout: sizeMB ? sizeMB * 1024 * 1024 * 2 : undefined,
			maxBodyLength: sizeMB ? sizeMB * 1024 * 1024 * 2 : undefined
		});
	}

	public async fetchAnalysis(analysisId: string): Promise<VirusTotalAnalysisResponse> {
		return makeVirusTotalRequest<VirusTotalAnalysisResponse>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.ANALYSES}/${analysisId}`)
		});
	}

	public async fetchFileReport(fileId: string): Promise<VirusTotalApiResponse<VirusTotalFileAttributes>> {
		return makeVirusTotalRequest<VirusTotalApiResponse<VirusTotalFileAttributes>>({
			method: 'GET',
			url: this.buildUrl(`${VIRUSTOTAL_CONFIG.API.ENDPOINTS.FILES}/${fileId}`)
		});
	}
}

// Container typings
declare module '@sapphire/pieces' {
	interface Container {
		virusTotalService: VirusTotalService;
	}
}
