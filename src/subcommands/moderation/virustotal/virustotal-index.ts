// virustotal-index module within subcommands/moderation/virustotal
export type { VirusTotalChatInputInteraction } from './types';

// Constants and configuration
export { VIRUSTOTAL_CONFIG, ERROR_MESSAGES, STATUS_CONFIG } from './constants';

// Utility functions
export {
	makeVirusTotalRequest,
	validateApiKey,
	secureFileDownload,
	calculateFileHashes,
	createSecureFormData,
	getSecurityStatus,
	getMaliciousEngines,
	checkMemoryAvailability,
	forceGarbageCollection,
	createProgressComponents,
	createDetailedReport,
	createReportComponents,
	handleVirusTotalError
} from './utils';

// Subcommand handlers
export { chatInputVirusTotalIp } from './virustotal-ip';
export { chatInputVirusTotalDomain } from './virustotal-domain';
export { chatInputVirusTotalFile } from './virustotal-file';
export { chatInputVirusTotalUrl } from './virustotal-url';
