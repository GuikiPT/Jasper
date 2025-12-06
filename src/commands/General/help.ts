// help module within commands/General
import { ApplyOptions } from '@sapphire/decorators';
import { Args, BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ApplicationIntegrationType,
	ButtonBuilder,
	ButtonStyle,
	InteractionContextType,
	MessageFlags,
	SlashCommandBuilder,
	SlashCommandStringOption,
	type MessageActionRowComponentBuilder,
	type ChatInputCommandInteraction,
	type AutocompleteInteraction,
	type Message,
	SlashCommandBooleanOption
} from 'discord.js';
import { createErrorTextComponent } from '../../lib/components.js';


// Interactive /help command with autocomplete-backed command lookup
type DetailedDescriptionMetadata =
	| string
	| {
		summary?: string;
		chatInputUsage?: string;
		messageUsage?: string;
		examples?: string[];
		notes?: string[];
		subcommands?: Array<{
			group?: string;
			name: string;
			description?: string;
			chatInputUsage?: string;
			messageUsage?: string;
			examples?: string[];
			notes?: string[];
			aliases?: string[];
			keywords?: string[];
		}>;
	};

interface NormalisedSubcommandMetadata {
	group?: string;
	name: string;
	description?: string;
	chatInputUsage?: string;
	messageUsage?: string;
	examples: string[];
	notes: string[];
	aliases: string[];
	keywords: string[];
}

interface NormalisedMetadata {
	summary?: string;
	chatInputUsage?: string;
	messageUsage?: string;
	examples: string[];
	notes: string[];
	subcommands: NormalisedSubcommandMetadata[];
}

interface HelpEntry {
	key: string;
	type: 'command' | 'subcommand';
	command: Command;
	commandName: string;
	fullPath: string[];
	description: string;
	aliases: string[];
	keywords: string[];
	metadata: NormalisedMetadata;
	subcommand?: NormalisedSubcommandMetadata;
}

interface HelpReplyPayload {
	component: ReturnType<typeof createErrorTextComponent>;
	flags: number;
}

@ApplyOptions<Command.Options>({
	name: 'help',
	description: 'Look up usage details for Jasper commands.',
	detailedDescription: {
		summary:
			'Use `/help` or `j!help` to explore every command Jasper provides. Start typing for autocomplete suggestions, or run without arguments to see an overview grouped by category.',
		chatInputUsage: '/help [command]',
		messageUsage: '{{prefix}}help [command]',
		examples: ['/help settings prefixes set', '{{prefix}}help tag create'],
		notes: ['Autocomplete supports both command names and subcommands.']
	},
	fullCategory: ['General'],
	runIn: [CommandOptionsRunTypeEnum.Dm, CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	// requiredClientPermissions: ['SendMessages'],
	// Restrict usage to allowed role buckets
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: [
					'allowedAdminRoles',
					'allowedStaffRoles',
					'allowedTagAdminRoles',
					'allowedTagRoles',
					'supportRoles'
				] as const,
				allowManageGuild: false,
				errorMessage: 'You need an allowed tag role, staff role, or admin role to use this command.'
			}
		}
	]
})
// Central entry point for /help: lookup, autocomplete, and help rendering
export class HelpCommand extends Command {
	// Allow both guild and user install for the command
	private readonly integrationTypes: ApplicationIntegrationType[] = [
		ApplicationIntegrationType.GuildInstall,
		ApplicationIntegrationType.UserInstall
	];

	// Base docs URL used for the optional "Docs" button
	private readonly docsBaseUrl = 'https://docs.guiki.pt/docs/jasper-revamp/commands';

	// Explicit mapping from command path to docs anchor
	private readonly docsAnchorMap: Record<string, string> = {
		help: 'help',
		ping: 'ping',
		topic: 'topic',
		snipe: 'snipe',
		virustotal: 'virustotal',
		'virustotal ip': 'virustotal-ip',
		'virustotal domain': 'virustotal-domain',
		'virustotal file': 'virustotal-file',
		'virustotal url': 'virustotal-url',
		resolve: 'resolve',
		tag: 'tag',
		'tag create': 'tag-create',
		'tag delete': 'tag-delete',
		'tag edit': 'tag-edit',
		'tag export': 'tag-export',
		'tag import': 'tag-import',
		'tag info': 'tag-info',
		'tag list': 'tag-list',
		'tag raw': 'tag-raw',
		'tag show': 'tag-show',
		'tag use': 'tag-use',
		settings: 'settings-commands',
		'settings prefixes set': 'settings-prefixes-set',
		'settings prefixes view': 'settings-prefixes-view',
		'settings roles add': 'settings-roles-add',
		'settings roles remove': 'settings-roles-remove',
		'settings roles list': 'settings-roles-list',
		'settings channels add': 'settings-channels-add',
		'settings channels remove': 'settings-channels-remove',
		'settings channels list': 'settings-channels-list',
		'settings topics add': 'settings-topics-add',
		'settings topics remove': 'settings-topics-remove',
		'settings topics list': 'settings-topics-list',
		'settings topics import': 'settings-topics-import',
		'settings topics export': 'settings-topics-export',
		'settings support set': 'settings-support-set',
		'settings support view': 'settings-support-view',
		'settings slowmode view': 'settings-slowmode-view',
		'settings slowmode configure': 'settings-slowmode-configure',
		'settings youtube enable': 'settings-youtube-enable',
		'settings youtube disable': 'settings-youtube-disable',
		'settings youtube view': 'settings-youtube-view',
		'settings youtube test': 'settings-youtube-test',
		'settings youtube force-update': 'settings-youtube-force-update'
	};

	// Restrict /help slash usage to guilds only
	private readonly contexts: InteractionContextType[] = [
		// InteractionContextType.BotDM,
		InteractionContextType.Guild
		// InteractionContextType.PrivateChannel
	];

	// Maximum number of autocomplete choices to return
	private readonly maxAutocompleteResults = 25;

	// Register /help with optional command + ephemeral options
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder: SlashCommandBuilder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(this.integrationTypes)
				.setContexts(this.contexts)
				.addStringOption((option: SlashCommandStringOption) =>
					option.setName('command').setDescription('Command or subcommand to look up.').setAutocomplete(true).setRequired(false)
				)
				.addBooleanOption((option: SlashCommandBooleanOption) =>
					option.setName('ephemeral').setDescription('Whether the response should be visible only to you.').setRequired(false)
				)
		);
	}

	// Handle autocomplete: score entries against the query and return top matches
	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		try {
			const focused = interaction.options.getFocused(true);
			const query = String(focused.value ?? '')
				.trim()
				.toLowerCase();
			const entries = this.collectEntries();

			const scored = entries
				.map((entry) => ({ entry, score: this.scoreEntry(entry, query) }))
				.filter(({ score }) => score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, this.maxAutocompleteResults);

			const emptyFallback = !query
				? entries
					.filter((entry) => entry.type === 'command')
					.sort((a, b) => a.commandName.localeCompare(b.commandName))
					.slice(0, this.maxAutocompleteResults)
					.map((entry) => ({ entry, score: 1 }))
				: [];

			const collection = scored.length > 0 ? scored : emptyFallback;
			if (collection.length === 0) {
				return interaction.respond([]);
			}

			const choices = collection.map(({ entry }) => ({
				name: this.buildAutocompleteLabel(entry),
				value: entry.key
			}));

			return interaction.respond(choices);
		} catch (error) {
			this.container.logger.error('[Help] Autocomplete failed', error, {
				guildId: interaction.guildId ?? 'dm'
			});
			try {
				return interaction.respond([]);
			} catch (respondError) {
				this.container.logger.debug('[Help] Failed to send autocomplete fallback', respondError);
				return;
			}
		}
	}

	// Slash /help handler: resolve entry (if any) and send contextual help
	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		try {
			const requested = interaction.options.getString('command');
			const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;
			const normalizedQuery = requested?.trim() ?? '';
			const entries = this.collectEntries();
			const entry = this.findEntry(entries, normalizedQuery);

			const prefix = await this.resolvePrefix(interaction.guildId);

			const response = entry
				? this.createEntryResponse(entry, prefix, { ephemeral: isEphemeral })
				: normalizedQuery
					? this.createNotFoundResponse({ query: normalizedQuery, mode: 'slash', prefix })
					: this.createOverviewResponse(entries, prefix, { ephemeral: isEphemeral });

			return interaction.reply({
				components: [response.component],
				flags: response.flags
			});
		} catch (error) {
			this.container.logger.error('[Help] Failed to build help response', error, {
				guildId: interaction.guildId ?? 'dm',
				commandOption: interaction.options.getString('command') ?? 'none'
			});
			const fallbackComponent = createErrorTextComponent('I hit an error while building help content. Please try again in a moment.');
			const flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
			if (interaction.deferred || interaction.replied) {
				return interaction.editReply({ components: [fallbackComponent], flags }).catch(() => undefined);
			}
			return interaction.reply({ components: [fallbackComponent], flags }).catch(() => undefined);
		}
	}

	// Message-based help handler mirroring slash flow
	public override async messageRun(message: Message, args: Args) {
		try {
			const rawQuery = args.finished ? null : await args.rest('string');
			const normalizedQuery = rawQuery?.trim() ?? '';
			const entries = this.collectEntries();
			const entry = this.findEntry(entries, normalizedQuery);

			const prefix = await this.resolvePrefix(message.guildId);

			const response = entry
				? this.createEntryResponse(entry, prefix, { ephemeral: false })
				: normalizedQuery
					? this.createNotFoundResponse({ query: normalizedQuery, mode: 'message', prefix })
					: this.createOverviewResponse(entries, prefix, { ephemeral: false });

			return message.reply({
				components: [response.component],
				flags: response.flags
			});
		} catch (error) {
			this.container.logger.error('[Help] Failed to send message-based help', error, {
				guildId: message.guildId ?? 'dm'
			});
			return message.reply('I ran into a problem while building help info. Please try again.').catch(() => undefined);
		}
	}

	// Resolve the best matching help entry, falling back to fuzzy scoring
	private findEntry(entries: HelpEntry[], rawQuery: string | null): HelpEntry | null {
		if (!rawQuery) return null;

		const query = rawQuery.trim().toLowerCase();
		if (!query) return null;

		const direct = entries.find((item) => {
			if (item.key.toLowerCase() === query) return true;
			if (item.fullPath.join(' ').toLowerCase() === query) return true;
			if (item.aliases.some((alias) => alias.toLowerCase() === query)) return true;
			return item.keywords.some((keyword) => keyword.toLowerCase() === query);
		});
		if (direct) {
			return direct;
		}

		let bestMatch: HelpEntry | null = null;
		let bestScore = 0;

		for (const item of entries) {
			const score = this.scoreEntry(item, query);
			if (score > bestScore) {
				bestScore = score;
				bestMatch = item;
			}
		}

		return bestScore > 0 ? bestMatch : null;
	}

	// Flatten commands + subcommands from Sapphire's command store
	private collectEntries(): HelpEntry[] {
		const entries: HelpEntry[] = [];
		const store = this.container.stores.get('commands');

		for (const command of store.values()) {
			if (!command.enabled) continue;
			const metadata = this.normaliseMetadata(command.detailedDescription as DetailedDescriptionMetadata);
			const aliases = Array.isArray(command.aliases) ? command.aliases : [];
			const keywords = new Set<string>([command.name.toLowerCase(), ...aliases.map((alias) => alias.toLowerCase())]);

			const baseEntry: HelpEntry = {
				key: command.name,
				type: 'command',
				command,
				commandName: command.name,
				fullPath: [command.name],
				description: command.description ?? '',
				aliases,
				keywords: Array.from(keywords),
				metadata
			};

			entries.push(baseEntry);

			for (const sub of metadata.subcommands) {
				const path = [command.name];
				if (sub.group) path.push(sub.group);
				path.push(sub.name);

				const subAliases = sub.aliases ?? [];
				const subKeywords = new Set<string>([
					...path.map((part) => part.toLowerCase()),
					...subAliases.map((alias) => alias.toLowerCase()),
					...(sub.keywords ?? [])
				]);

				entries.push({
					key: path.join(' '),
					type: 'subcommand',
					command,
					commandName: command.name,
					fullPath: path,
					description: sub.description ?? command.description ?? '',
					aliases: subAliases,
					keywords: Array.from(subKeywords),
					metadata,
					subcommand: sub
				});
			}
		}

		return entries;
	}

	// Normalise Sapphire detailedDescription into a consistent internal shape
	private normaliseMetadata(details: DetailedDescriptionMetadata): NormalisedMetadata {
		if (!details) {
			return { examples: [], notes: [], subcommands: [] };
		}

		if (typeof details === 'string') {
			return { summary: details, examples: [], notes: [], subcommands: [] };
		}

		const summary = typeof details.summary === 'string' ? details.summary : undefined;
		const chatInputUsage = typeof details.chatInputUsage === 'string' ? details.chatInputUsage : undefined;
		const messageUsage = typeof details.messageUsage === 'string' ? details.messageUsage : undefined;
		const examples = Array.isArray(details.examples) ? details.examples.filter((item): item is string => typeof item === 'string') : [];
		const notes = Array.isArray(details.notes) ? details.notes.filter((item): item is string => typeof item === 'string') : [];

		const subcommands: NormalisedSubcommandMetadata[] = Array.isArray(details.subcommands)
			? details.subcommands.flatMap((entry) => {
				if (!entry || typeof entry !== 'object') return [];
				if (typeof entry.name !== 'string') return [];
				const group = typeof entry.group === 'string' ? entry.group : undefined;
				const description = typeof entry.description === 'string' ? entry.description : undefined;
				const chatUsage = typeof entry.chatInputUsage === 'string' ? entry.chatInputUsage : undefined;
				const messageUsageLocal = typeof entry.messageUsage === 'string' ? entry.messageUsage : undefined;
				const examplesLocal = Array.isArray(entry.examples)
					? entry.examples.filter((item): item is string => typeof item === 'string')
					: [];
				const notesLocal = Array.isArray(entry.notes) ? entry.notes.filter((item): item is string => typeof item === 'string') : [];
				const aliases = Array.isArray(entry.aliases) ? entry.aliases.filter((item): item is string => typeof item === 'string') : [];
				const keywords = Array.isArray(entry.keywords) ? entry.keywords.filter((item): item is string => typeof item === 'string') : [];

				const normalised: NormalisedSubcommandMetadata = {
					group,
					name: entry.name,
					description,
					chatInputUsage: chatUsage,
					messageUsage: messageUsageLocal,
					examples: examplesLocal,
					notes: notesLocal,
					aliases,
					keywords
				};

				return [normalised];
			})
			: [];

		return { summary, chatInputUsage, messageUsage, examples, notes, subcommands };
	}

	// Score a help entry for autocomplete ranking (higher = better match)
	private scoreEntry(entry: HelpEntry, query: string): number {
		if (!query) {
			return entry.type === 'command' ? 3 : 2;
		}

		const haystacks = new Set<string>([
			entry.key.toLowerCase(),
			entry.fullPath.join(' ').toLowerCase(),
			entry.description.toLowerCase(),
			...entry.aliases.map((alias) => alias.toLowerCase()),
			...entry.keywords
		]);

		let score = 0;
		for (const haystack of haystacks) {
			if (!haystack) continue;
			if (haystack === query) {
				return 100;
			}
			if (haystack.startsWith(query)) {
				score = Math.max(score, 75);
				continue;
			}
			if (haystack.includes(query)) {
				score = Math.max(score, 50);
			}
		}

		return score;
	}

	// Build autocomplete label: slash path + short summary
	private buildAutocompleteLabel(entry: HelpEntry): string {
		const displayPath = `/${entry.fullPath.join(' ')}`;
		const summary =
			entry.type === 'subcommand' ? (entry.subcommand?.description ?? entry.description) : (entry.metadata.summary ?? entry.description);

		if (!summary) {
			return displayPath.slice(0, 100);
		}

		const cleanedSummary = summary.replace(/\s+/g, ' ').trim();
		const combined = `${displayPath} • ${cleanedSummary}`;
		return combined.length > 100 ? `${combined.slice(0, 97)}…` : combined;
	}

	// Build rich markdown help body for a single command/subcommand
	private buildHelpMessage(entry: HelpEntry, prefix: string): string {
		const lines: string[] = [];
		const slashPath = `/${entry.fullPath.join(' ')}`;
		const summary =
			entry.type === 'subcommand' ? (entry.subcommand?.description ?? entry.description) : (entry.metadata.summary ?? entry.description);

		lines.push(`### ${entry.type === 'command' ? 'Command' : 'Subcommand'}: ${slashPath}`);

		if (entry.type === 'subcommand') {
			lines.push(`Parent command: \`${entry.commandName}\``);
		}

		if (summary) {
			lines.push('', summary.trim());
		}

		const chatUsage = this.resolveChatUsage(entry);
		const messageUsage = this.resolveMessageUsage(entry, prefix);

		const usageLines: string[] = [];
		if (chatUsage) usageLines.push(`Slash: \`${chatUsage}\``);
		if (messageUsage) usageLines.push(`Message: \`${messageUsage}\``);
		if (usageLines.length > 0) {
			lines.push('', '**Usage**', usageLines.join('\n'));
		}

		const examples = this.resolveExamples(entry, prefix);
		if (examples.length > 0) {
			lines.push('', '**Examples**');
			for (const example of examples) {
				lines.push(`- \`${example}\``);
			}
		}

		const notes = this.resolveNotes(entry);
		if (notes.length > 0) {
			lines.push('', '**Notes**');
			for (const note of notes) {
				lines.push(`- ${note}`);
			}
		}

		if (entry.type === 'command') {
			const childSummaries = entry.metadata.subcommands.map((sub) => {
				const childPath = this.composeSubcommandPath(entry.commandName, sub);
				const description = sub.description ?? 'See details with `/help`.';
				return `- \`${childPath}\`: ${description}`;
			});
			if (childSummaries.length > 0) {
				lines.push('', '**Subcommands**', ...childSummaries);
			}
		}

		return lines.join('\n').trim();
	}

	// Build overview body shown when /help is called without args
	private buildOverviewMessage(entries: HelpEntry[], prefix: string): string {
		const lines: string[] = [];
		lines.push('### Jasper Help Overview');
		lines.push(
			'Use `/help <command>` or `{{prefix}}help <command>` for detailed instructions. Autocomplete works for every command and subcommand.'
		);

		const grouped = new Map<string, HelpEntry[]>();
		for (const entry of entries) {
			if (entry.type !== 'command') continue;
			const category = entry.command.category ?? 'Uncategorised';
			const bucket = grouped.get(category) ?? [];
			bucket.push(entry);
			grouped.set(category, bucket);
		}

		for (const [category, categoryEntries] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
			lines.push('', `**${category}**`);
			for (const entry of categoryEntries.sort((a, b) => a.commandName.localeCompare(b.commandName))) {
				const messageUsage = this.resolveMessageUsage(entry, prefix);
				const summary = entry.metadata.summary ?? entry.description;
				const bulletParts = [`/${entry.commandName}`];
				if (messageUsage) bulletParts.push(`(${messageUsage})`);
				const bullet = bulletParts.join(' ');
				lines.push(`- \`${bullet}\`: ${summary}`);
			}
		}

		return lines.join('\n').replace(/\{\{prefix\}\}/g, prefix);
	}

	// Resolve best slash usage string for the entry
	private resolveChatUsage(entry: HelpEntry): string | null {
		if (entry.type === 'subcommand') {
			const usage = entry.subcommand?.chatInputUsage ?? entry.metadata.chatInputUsage;
			return usage ? usage.replace(/\s+/g, ' ').trim() : `/${entry.fullPath.join(' ')}`;
		}

		const usage = entry.metadata.chatInputUsage;
		if (usage) {
			return usage.replace(/\s+/g, ' ').trim();
		}

		return entry.command.supportsChatInputCommands() ? `/${entry.commandName}` : null;
	}

	// Resolve best prefix-based usage string for the entry
	private resolveMessageUsage(entry: HelpEntry, prefix: string): string | null {
		const raw = entry.type === 'subcommand' ? (entry.subcommand?.messageUsage ?? entry.metadata.messageUsage) : entry.metadata.messageUsage;
		if (raw) {
			return this.applyPrefix(raw, prefix);
		}

		if (!entry.command.supportsMessageCommands()) {
			return null;
		}

		const template = `{{prefix}}${entry.fullPath.join(' ')}`;
		return this.applyPrefix(template, prefix);
	}

	// Normalise examples and inject resolved prefix
	private resolveExamples(entry: HelpEntry, prefix: string): string[] {
		const examples = entry.type === 'subcommand' ? (entry.subcommand?.examples ?? entry.metadata.examples) : entry.metadata.examples;
		if (!examples) return [];
		return examples.map((example) => this.applyPrefix(example, prefix)).filter(Boolean) as string[];
	}

	// Get notes array for the entry
	private resolveNotes(entry: HelpEntry): string[] {
		const notes = entry.type === 'subcommand' ? (entry.subcommand?.notes ?? entry.metadata.notes) : entry.metadata.notes;
		return notes ?? [];
	}

	// Join command + group + subcommand into a single slash-style path
	private composeSubcommandPath(commandName: string, sub: NormalisedSubcommandMetadata): string {
		const parts = [commandName];
		if (sub.group) parts.push(sub.group);
		parts.push(sub.name);
		return parts.join(' ');
	}

	// Apply prefix template and normalise whitespace
	private applyPrefix(value: string, prefix: string): string {
		return value
			.replace(/\{\{prefix\}\}/g, prefix)
			.replace(/\s+/g, ' ')
			.trim();
	}

	// Get guild-specific prefix, with safe fallback to default
	private async resolvePrefix(guildId: string | null): Promise<string> {
		const defaultPrefix = this.extractDefaultPrefix();

		if (!guildId) {
			return defaultPrefix;
		}

		try {
			const customPrefix = await this.container.guildSettingsService.getPrefix(guildId);
			return customPrefix ?? defaultPrefix;
		} catch (error) {
			this.container.logger.warn('[Help] Failed to fetch guild prefix; falling back to default', error, {
				guildId
			});
			return defaultPrefix;
		}
	}

	// Read the first configured default prefix from the client options
	private extractDefaultPrefix(): string {
		const option = this.container.client.options.defaultPrefix;
		if (typeof option === 'string') return option;
		if (Array.isArray(option) && option.length > 0) return option[0]!;
		return 'j!';
	}

	// Attach "Docs" button to the help component when an anchor can be derived
	private attachDocsButton(container: ReturnType<typeof createErrorTextComponent>, entry: HelpEntry) {
		const anchor = this.buildDocsAnchor(entry);
		if (!anchor) return;

		container.addActionRowComponents(
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Docs').setURL(`${this.docsBaseUrl}#${anchor}`)
			)
		);
	}

	// Build a docs anchor from explicit map or from the full path slug
	private buildDocsAnchor(entry: HelpEntry): string | null {
		const pathKey = entry.fullPath.join(' ');
		const direct = this.docsAnchorMap[pathKey];
		if (direct) {
			return direct;
		}

		if (entry.type === 'command') {
			const root = this.docsAnchorMap[entry.commandName];
			if (root) {
				return root;
			}
		}

		const slug = entry.fullPath
			.map((part) => part.trim().replace(/\s+/g, '-').toLowerCase())
			.filter(Boolean)
			.join('-');

		return slug || null;
	}

	// Create reply payload for a successful entry lookup
	private createEntryResponse(entry: HelpEntry, prefix: string, options: { ephemeral: boolean }): HelpReplyPayload {
		const content = this.buildHelpMessage(entry, prefix);
		const component = createErrorTextComponent(content);
		this.attachDocsButton(component, entry);
		return this.toPayload(component, options.ephemeral);
	}

	// Create reply payload for the overview case (no specific command)
	private createOverviewResponse(entries: HelpEntry[], prefix: string, options: { ephemeral: boolean }): HelpReplyPayload {
		const overview = this.buildOverviewMessage(entries, prefix);
		const component = createErrorTextComponent(overview);
		return this.toPayload(component, options.ephemeral);
	}

	// Create reply payload used when lookup fails
	private createNotFoundResponse(args: { query: string; mode: 'slash' | 'message'; prefix: string }): HelpReplyPayload {
		const { query, mode, prefix } = args;
		const message =
			mode === 'slash'
				? `I couldn't find a command or subcommand matching \`${query}\`. Try running \`/help\` to see everything available.`
				: `I couldn't find a command or subcommand matching \`${query}\`. Try \`${prefix}help\` for an overview.`;
		const component = createErrorTextComponent(message);
		const isEphemeral = mode === 'slash';
		return this.toPayload(component, isEphemeral);
	}

	// Normalise a component into a payload with correctly computed MessageFlags
	private toPayload(component: ReturnType<typeof createErrorTextComponent>, ephemeral: boolean): HelpReplyPayload {
		let flags = MessageFlags.IsComponentsV2;
		if (ephemeral) {
			flags |= MessageFlags.Ephemeral;
		}
		return { component, flags };
	}
}
