// Enhanced types for VirusTotal API responses and internal use
import type { ChatInputCommandInteraction } from 'discord.js';

export type VirusTotalChatInputInteraction = ChatInputCommandInteraction<'cached'>;

export interface VirusTotalAnalysisStats {
	malicious: number;
	suspicious: number;
	harmless: number;
	undetected: number;
	'type-unsupported'?: number;
}

export interface VirusTotalEngineResult {
	category: 'malicious' | 'suspicious' | 'harmless' | 'undetected' | 'type-unsupported';
	result: string | null;
	method: string;
	engine_name: string;
	engine_version: string;
	engine_update: string;
}

export interface VirusTotalFileAttributes {
	sha256: string;
	md5: string;
	sha1: string;
	size: number;
	type_description: string;
	type_extension: string;
	last_analysis_date: number;
	last_analysis_stats: VirusTotalAnalysisStats;
	last_analysis_results: Record<string, VirusTotalEngineResult>;
	reputation: number;
	times_submitted: number;
	total_votes: {
		harmless: number;
		malicious: number;
	};
	meaningful_name?: string;
	names?: string[];
}

export interface VirusTotalUrlAttributes {
	url: string;
	title?: string;
	last_http_response_code: number;
	last_analysis_date: number;
	last_analysis_stats: VirusTotalAnalysisStats;
	last_analysis_results: Record<string, VirusTotalEngineResult>;
	reputation: number;
	times_submitted: number;
	total_votes: {
		harmless: number;
		malicious: number;
	};
	categories: Record<string, string>;
	tags: string[];
}

export interface VirusTotalIpAttributes {
	country: string;
	continent: string;
	as_owner: string;
	asn: number;
	network: string;
	regional_internet_registry: string;
	last_analysis_date: number;
	last_analysis_stats: VirusTotalAnalysisStats;
	last_analysis_results: Record<string, VirusTotalEngineResult>;
	reputation: number;
	total_votes: {
		harmless: number;
		malicious: number;
	};
	tags: string[];
	whois?: string;
	jarm?: string;
	last_https_certificate?: {
		issuer: { CN: string };
		subject: { CN: string };
		validity: {
			not_before: string;
			not_after: string;
		};
		thumbprint: string;
	};
}

export interface VirusTotalApiResponse<T> {
	data: {
		type: string;
		id: string;
		attributes: T;
	};
}

export interface VirusTotalUploadResponse {
	data: {
		type: string;
		id: string;
	};
}

export interface VirusTotalAnalysisResponse {
	data: {
		type: string;
		id: string;
		attributes: {
			status: 'queued' | 'in-progress' | 'completed';
			date: number;
		};
		meta: {
			file_info: {
				sha256: string;
				size: number;
			};
		};
	};
}

export interface SecurityStatus {
	level: 'safe' | 'suspicious' | 'malicious';
	emoji: string;
	text: string;
	color: number;
}

export interface ProcessingResult<T> {
	success: boolean;
	data?: T;
	error?: string;
	analysisId?: string;
}
