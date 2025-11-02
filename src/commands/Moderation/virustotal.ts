import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	type SlashCommandBuilder,
	type SlashCommandStringOption,
	type SlashCommandSubcommandBuilder,
	type SlashCommandAttachmentOption
} from 'discord.js';
import {
	chatInputVirusTotalIp,
	chatInputVirusTotalDomain,
	chatInputVirusTotalFile,
	chatInputVirusTotalUrl,
	type VirusTotalChatInputInteraction
} from '../../subcommands/moderation/virustotal/virustotal-index';

// Aggregates the entire `/virustotal` feature set into a single subcommand-driven command.

@ApplyOptions<Subcommand.Options>({
	name: 'virustotal',
	description: 'Analyze files, URLs, domains, and IP addresses using VirusTotal.',
	detailedDescription: {
		summary: 'Submit suspicious files, URLs, domains, and IP addresses to VirusTotal for security analysis.',
		chatInputUsage: '/virustotal <subcommand>',
		notes: [
			'VirusTotal analyzes files and URLs for malware and other threats.',
			'Results include detection ratios from multiple antivirus engines.',
			'This command requires appropriate permissions for moderation actions.'
		],
		subcommands: [
			{
				name: 'ip',
				description: 'Analyze an IP address for malicious activity.',
				chatInputUsage: '/virustotal ip address:<ip_address>',
				notes: ['Provides reputation data and detection information for the specified IP.']
			},
			{
				name: 'domain',
				description: 'Check a domain for malicious activity and reputation.',
				chatInputUsage: '/virustotal domain name:<domain>',
				notes: ['Analyzes domain reputation and security status across multiple sources.']
			},
			{
				name: 'file',
				description: 'Upload and scan a file for malware.',
				chatInputUsage: '/virustotal file attachment:<file>',
				notes: ['Uploads the file to VirusTotal for comprehensive malware analysis.']
			},
			{
				name: 'url',
				description: 'Scan a URL for malicious content.',
				chatInputUsage: '/virustotal url link:<url>',
				notes: ['Submits the URL to VirusTotal for security scanning and analysis.']
			}
		]
	},
	fullCategory: ['Moderation'],
	cooldownLimit: 3,
	cooldownDelay: 10_000,
	cooldownScope: BucketScope.User,
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['allowedStaffRoles', 'allowedAdminRoles', 'supportRoles'] as const,
				allowManageGuild: true,
				errorMessage: 'VirusTotal commands may only be used by users with "Staff Roles", "Admin Roles", or the "Manage Guild" permission.'
			}
		}
	],
	requiredClientPermissions: ['SendMessages', 'EmbedLinks'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subcommands: [
		{
			name: 'ip',
			chatInputRun: 'chatInputVirusTotalIp'
		},
		{
			name: 'domain',
			chatInputRun: 'chatInputVirusTotalDomain'
		},
		{
			name: 'file',
			chatInputRun: 'chatInputVirusTotalFile'
		},
		{
			name: 'url',
			chatInputRun: 'chatInputVirusTotalUrl'
		}
	]
})
export class ModerationVirusTotalCommand extends Subcommand {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];

	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('ip')
						.setDescription('Analyze an IP address for malicious activity.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('address').setDescription('The IP address to analyze.').setRequired(true)
						)
						.addBooleanOption((option) =>
							option.setName('ephemeral').setDescription('Whether the response should be visible only to you.').setRequired(false)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('domain')
						.setDescription('Check a domain for malicious activity.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('name').setDescription('The domain name to analyze.').setRequired(true)
						)
						.addBooleanOption((option) =>
							option.setName('ephemeral').setDescription('Whether the response should be visible only to you.').setRequired(false)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('file')
						.setDescription('Upload and scan a file for malware.')
						.addAttachmentOption((option: SlashCommandAttachmentOption) =>
							option.setName('attachment').setDescription('The file to scan for malware.').setRequired(true)
						)
						.addBooleanOption((option) =>
							option.setName('ephemeral').setDescription('Whether the response should be visible only to you.').setRequired(false)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('url')
						.setDescription('Scan a URL for malicious content.')
						.addStringOption((option: SlashCommandStringOption) =>
							option.setName('link').setDescription('The URL to scan for threats.').setRequired(true)
						)
						.addBooleanOption((option) =>
							option.setName('ephemeral').setDescription('Whether the response should be visible only to you.').setRequired(false)
						)
				)
		);
	}

	public async chatInputVirusTotalIp(interaction: VirusTotalChatInputInteraction) {
		return chatInputVirusTotalIp(this, interaction);
	}

	public async chatInputVirusTotalDomain(interaction: VirusTotalChatInputInteraction) {
		return chatInputVirusTotalDomain(this, interaction);
	}

	public async chatInputVirusTotalFile(interaction: VirusTotalChatInputInteraction) {
		return chatInputVirusTotalFile(this, interaction);
	}

	public async chatInputVirusTotalUrl(interaction: VirusTotalChatInputInteraction) {
		return chatInputVirusTotalUrl(this, interaction);
	}
}
