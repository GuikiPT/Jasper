import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';

import { VirusTotalChatInputInteraction } from './types';
import { getSecurityStatus, getMaliciousEngines, createReportComponents, handleVirusTotalError, formatUnixDate } from './utils';

// Handle /virustotal domain subcommand: analyze domain reputation and security
export async function chatInputVirusTotalDomain(_command: Subcommand, interaction: VirusTotalChatInputInteraction) {
	const domain = interaction.options.getString('name', true);
	const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;

	await interaction.deferReply({ flags: isEphemeral ? MessageFlags.Ephemeral : [] });

	try {
		// Fetch domain data from VirusTotal
		const data = await _command.container.virusTotalService.fetchDomain(domain);

		const stats = data.data.attributes.last_analysis_stats;
		const attributes = data.data.attributes;
		const status = getSecurityStatus(stats);

		// Extract domain metadata
		const tld = attributes.tld || 'Unknown';
		const reputation = attributes.reputation || 0;
		const totalVotes = attributes.total_votes || {};
		const harmlessVotes = totalVotes.harmless || 0;
		const maliciousVotes = totalVotes.malicious || 0;
		const tags = attributes.tags || [];
		const categories = attributes.categories || {};
		const lastAnalysisDate = formatUnixDate(attributes.last_analysis_date);
		const creationDate = formatUnixDate(attributes.creation_date);
		const maliciousEngines = getMaliciousEngines(attributes.last_analysis_results || {});

		// Format popularity rankings
		const popularityRanks = attributes.popularity_ranks || {};
		const rankInfo =
			Object.entries(popularityRanks)
				.map(([source, info]: [string, any]) => `${source}: #${info.rank}`)
				.join(', ') || 'Not ranked';

		// Format DNS records summary
		const dnsRecords = attributes.last_dns_records || [];
		const dnsSummary = dnsRecords
			.slice(0, 5)
			.map((record: any) => `${record.type}: ${record.value}`)
			.join('\n');

		// Build detailed text report for download
		const detailedReport = buildDetailedReport(domain, attributes, stats, {
			tld,
			creationDate,
			reputation,
			lastAnalysisDate,
			harmlessVotes,
			maliciousVotes,
			rankInfo,
			categories,
			tags,
			maliciousEngines,
			dnsRecords
		});

		// Build Discord component sections
		const sections = buildReportSections(domain, {
			tld,
			creationDate,
			reputation,
			stats,
			harmlessVotes,
			maliciousVotes,
			lastAnalysisDate,
			rankInfo,
			categories,
			tags,
			maliciousEngines,
			dnsSummary
		});

		const components = createReportComponents(
			'VirusTotal Domain Report',
			status,
			sections,
			`https://www.virustotal.com/gui/domain/${domain}`,
			`virustotal-domain-${domain}.txt`
		);

		await interaction.editReply({
			files: [
				{
					attachment: Buffer.from(detailedReport),
					name: `virustotal-domain-${domain}.txt`
				}
			],
			components,
			flags: MessageFlags.IsComponentsV2
		});
	} catch (error) {
		const errorMessage = handleVirusTotalError(error, { domain });
		await interaction.editReply({ content: errorMessage });
	}
}

// Build comprehensive text report for download
function buildDetailedReport(
	domain: string,
	attributes: any,
	stats: any,
	metadata: {
		tld: string;
		creationDate: string;
		reputation: number;
		lastAnalysisDate: string;
		harmlessVotes: number;
		maliciousVotes: number;
		rankInfo: string;
		categories: any;
		tags: string[];
		maliciousEngines: string[];
		dnsRecords: any[];
	}
): string {
	return `
VIRUSTOTAL DOMAIN ANALYSIS REPORT
=================================

DOMAIN: ${domain}
TLD: ${metadata.tld}
CREATION DATE: ${metadata.creationDate}

REPUTATION SCORE: ${metadata.reputation}/100

LAST ANALYSIS DATE: ${metadata.lastAnalysisDate}

DETECTION SUMMARY:
- MALICIOUS: ${stats.malicious || 0} engines
- SUSPICIOUS: ${stats.suspicious || 0} engines
- CLEAN: ${stats.harmless || 0} engines
- UNDETECTED: ${stats.undetected || 0} engines

COMMUNITY VOTES:
- HARMLESS: ${metadata.harmlessVotes}
- MALICIOUS: ${metadata.maliciousVotes}

POPULARITY RANKS:
${metadata.rankInfo}

CATEGORIES: ${Object.keys(metadata.categories).length > 0 ? Object.keys(metadata.categories).join(', ') : 'None'}

TAGS: ${metadata.tags.length > 0 ? metadata.tags.join(', ') : 'None'}

MALICIOUS DETECTIONS:
${metadata.maliciousEngines.length > 0 ? metadata.maliciousEngines.map((engine) => `- ${engine}`).join('\n') : 'None detected'}

WHOIS INFORMATION:
${attributes.whois || 'Not available'}

DNS RECORDS (Latest 10):
${metadata.dnsRecords
	.slice(0, 10)
	.map((record: any) => `${record.type} ${record.ttl || 'N/A'} ${record.value}${record.priority ? ` priority ${record.priority}` : ''}`)
	.join('\n')}

LAST ANALYSIS RESULTS (Detailed):
${Object.entries(attributes.last_analysis_results || {})
	.map(([engine, result]: [string, any]) => `${engine}: ${result.category} (${result.result || 'N/A'})`)
	.join('\n')}

CERTIFICATE INFORMATION:
${
	attributes.last_https_certificate
		? `
ISSUER: ${attributes.last_https_certificate.issuer?.CN || 'Unknown'}
SUBJECT: ${attributes.last_https_certificate.subject?.CN || 'Unknown'}
VALID FROM: ${attributes.last_https_certificate.validity?.not_before || 'Unknown'}
VALID TO: ${attributes.last_https_certificate.validity?.not_after || 'Unknown'}
THUMBPRINT: ${attributes.last_https_certificate.thumbprint || 'Unknown'}
SERIAL: ${attributes.last_https_certificate.serial_number || 'Unknown'}
`
		: 'No certificate information available'
}

JARM FINGERPRINT: ${attributes.jarm || 'Not available'}

TOTAL VOTES: ${JSON.stringify(attributes.total_votes || {}, null, 2)}

Generated by Jasper Bot - ${new Date().toISOString()}
Powered by VirusTotal API
    `.trim();
}

// Build Discord component sections for display
function buildReportSections(
	domain: string,
	data: {
		tld: string;
		creationDate: string;
		reputation: number;
		stats: any;
		harmlessVotes: number;
		maliciousVotes: number;
		lastAnalysisDate: string;
		rankInfo: string;
		categories: any;
		tags: string[];
		maliciousEngines: string[];
		dnsSummary: string;
	}
): Array<{ title: string; content: string }> {
	return [
		{
			title: '🌐 **Domain Information**',
			content:
				`• **Domain:** \`${domain}\`\n` +
				`• **TLD:** \`${data.tld}\`\n` +
				`• **Created:** \`${data.creationDate}\`\n` +
				`• **Reputation:** \`${data.reputation}/100\``
		},
		{
			title: '📈 **Detection Summary:**',
			content:
				`• **Malicious:** \`${data.stats.malicious || 0}\` engines\n` +
				`• **Suspicious:** \`${data.stats.suspicious || 0}\` engines\n` +
				`• **Clean:** \`${data.stats.harmless || 0}\` engines\n` +
				`• **Undetected:** \`${data.stats.undetected || 0}\` engines`
		},
		{
			title: '🗳️ **Community & Analysis**',
			content:
				`**Community Votes:**\n` +
				`\`${data.harmlessVotes}\` ✅ | \`${data.maliciousVotes}\` ❌\n\n` +
				`**Last Analyzed:**\n` +
				`\`${data.lastAnalysisDate}\`\n\n` +
				`**Popularity:**\n` +
				`\`${data.rankInfo}\`` +
				(Object.keys(data.categories).length > 0 ? `\n**Categories:** \`${Object.keys(data.categories).join(', ')}\`` : '') +
				(data.tags.length > 0 ? `\n**Tags:** \`${data.tags.join(', ')}\`` : '') +
				(data.maliciousEngines.length > 0 ? `\n⚠️ **Detected by:** \`${data.maliciousEngines.join(', ')}\`` : '')
		},
		{
			title: '🔍 **DNS Records (Latest):**',
			content: data.dnsSummary ? `\`\`\`\n${data.dnsSummary}\n\`\`\`` : 'No DNS records available'
		}
	];
}
