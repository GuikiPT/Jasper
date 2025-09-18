import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	type SlashCommandBooleanOption,
	type SlashCommandBuilder,
	type SlashCommandStringOption,
	type SlashCommandSubcommandBuilder,
	type SlashCommandUserOption
} from 'discord.js';
import {
	chatInputTagCreate,
	chatInputTagDelete,
	chatInputTagEdit,
	chatInputTagImport,
	chatInputTagInfo,
	chatInputTagList,
	chatInputTagRaw,
	chatInputTagShow,
	chatInputTagUse,
	normalizeTagName,
	type TagChatInputInteraction
} from '../../subcommands/support/tag';

@ApplyOptions<Subcommand.Options>({
	name: 'tag',
	description: 'Manage reusable support tags.',
	fullCategory: ['Support'],
	cooldownLimit: 2,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.User,
	preconditions: ['SupportRoles'],
	requiredClientPermissions: ['SendMessages'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subcommands: [
		{ name: 'create', chatInputRun: 'chatInputTagCreate' },
		{ name: 'delete', chatInputRun: 'chatInputTagDelete' },
		{ name: 'edit', chatInputRun: 'chatInputTagEdit' },
		{ name: 'import', chatInputRun: 'chatInputTagImport' },
		{ name: 'info', chatInputRun: 'chatInputTagInfo' },
		{ name: 'list', chatInputRun: 'chatInputTagList' },
		{ name: 'raw', chatInputRun: 'chatInputTagRaw' },
		{ name: 'show', chatInputRun: 'chatInputTagShow' },
		{ name: 'use', chatInputRun: 'chatInputTagUse' }
	]
})
export class SupportTagCommand extends Subcommand {
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
					sub.setName('create').setDescription('Create a new support tag.'))
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('delete')
						.setDescription('Delete an existing tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to delete.')
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('edit')
						.setDescription('Update an existing tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to edit.')
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('import')
						.setDescription('Import tags from JSON data.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('payload')
								.setDescription('JSON array payload describing the tags to import.')
								.setRequired(true)
						)
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option
								.setName('overwrite')
								.setDescription('Replace existing tags instead of merging.')
								.setRequired(false)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('info')
						.setDescription('Show metadata about a tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag.')
								.setRequired(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('list')
						.setDescription('List available support tags.')
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('raw')
						.setDescription('Show the raw embed payload for a tag.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to inspect.')
								.setRequired(true)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('show')
						.setDescription('Preview a tag embed.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to preview.')
								.setRequired(true)
						)
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option
								.setName('ephemeral')
								.setDescription('Show the preview only to you.')
								.setRequired(false)
						)
				)
				.addSubcommand((sub: SlashCommandSubcommandBuilder) =>
					sub
						.setName('use')
						.setDescription('Send a tag to the current channel.')
						.addStringOption((option: SlashCommandStringOption) =>
							option
								.setName('name')
								.setDescription('Name of the tag to send.')
								.setRequired(true)
								.setAutocomplete(true)
						)
						.addUserOption((option: SlashCommandUserOption) =>
							option
								.setName('user')
								.setDescription('Mention a user alongside the tag.')
								.setRequired(false)
						)
						.addBooleanOption((option: SlashCommandBooleanOption) =>
							option
								.setName('ephemeral')
								.setDescription('Send the tag privately.')
								.setRequired(false)
						)
				)
		);
	}

	public async chatInputTagCreate(interaction: TagChatInputInteraction) {
		return chatInputTagCreate(this, interaction);
	}

	public async chatInputTagDelete(interaction: TagChatInputInteraction) {
		return chatInputTagDelete(this, interaction);
	}

	public async chatInputTagEdit(interaction: TagChatInputInteraction) {
		return chatInputTagEdit(this, interaction);
	}

	public async chatInputTagImport(interaction: TagChatInputInteraction) {
		return chatInputTagImport(this, interaction);
	}

	public async chatInputTagInfo(interaction: TagChatInputInteraction) {
		return chatInputTagInfo(this, interaction);
	}

	public async chatInputTagList(interaction: TagChatInputInteraction) {
		return chatInputTagList(this, interaction);
	}

	public async chatInputTagRaw(interaction: TagChatInputInteraction) {
		return chatInputTagRaw(this, interaction);
	}

	public async chatInputTagShow(interaction: TagChatInputInteraction) {
		return chatInputTagShow(this, interaction);
	}

	public async chatInputTagUse(interaction: TagChatInputInteraction) {
		return chatInputTagUse(this, interaction);
	}

	public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
		if (!interaction.guildId) {
			return interaction.respond([]);
		}

		const subcommand = interaction.options.getSubcommand(false);
		if (!subcommand || !['delete', 'edit', 'use'].includes(subcommand)) {
			return interaction.respond([]);
		}

		const focused = interaction.options.getFocused(true);
		if (focused.name !== 'name') {
			return interaction.respond([]);
		}

		const query = typeof focused.value === 'string' ? focused.value : '';
		const normalizedQuery = query ? normalizeTagName(query) : '';

		try {
			const tags = await this.container.database.guildSupportTag.findMany({
				where: { guildId: interaction.guildId },
				select: { name: true },
				orderBy: { name: 'asc' }
			});

			const startsWith: string[] = [];
			const contains: string[] = [];
			for (const { name } of tags) {
				if (!normalizedQuery) {
					contains.push(name);
					continue;
				}

				if (name.startsWith(normalizedQuery)) {
					startsWith.push(name);
				} else if (name.includes(normalizedQuery)) {
					contains.push(name);
				}
			}

			const suggestions = [...startsWith, ...contains]
				.slice(0, 25)
				.map((name) => ({ name, value: name }));

			return interaction.respond(suggestions);
		} catch (error) {
			this.container.logger.error('Failed to provide tag autocomplete suggestions', error);
			return interaction.respond([]);
		}
	}
}
