// utils module within subcommands/settings/topics
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';

export type TopicCommand = Subcommand;
export type TopicChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export const MAX_TOPIC_LENGTH = 256;
export const MAX_TOPICS_PER_IMPORT = 500;
export const MAX_IMPORT_FILE_SIZE = 256_000; // 250 KB safety guard

export const TOPIC_LIST_CUSTOM_ID = 'discussion_topics';
export const TOPIC_LIST_ITEMS_PER_PAGE = 10;
export const TOPIC_LIST_EMPTY_MESSAGE = 'No topics configured yet. Add one with `/settings topics add`.';

export const registerTopicSubcommandGroup = (group: SlashCommandSubcommandGroupBuilder) =>
	group
		.setName('topics')
		.setDescription('Manage the pool of discussion topics for this server.')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('add')
				.setDescription('Add a topic to the random prompt pool.')
				.addStringOption((option) =>
					option
						.setName('value')
						.setDescription('The topic text to store (max 256 characters).')
						.setRequired(true)
						.setMaxLength(MAX_TOPIC_LENGTH)
				)
		)
		.addSubcommand((subcommand) => subcommand.setName('list').setDescription('List the configured topics for this server.'))
		.addSubcommand((subcommand) =>
			subcommand
				.setName('remove')
				.setDescription('Remove a topic by selection menu, list position, or text matching.')
				.addStringOption((option) =>
					option
						.setName('topic')
						.setDescription('Select topic from dropdown menu.')
						.setAutocomplete(true)
				)
				.addIntegerOption((option) =>
					option
						.setName('position')
						.setDescription('Position number from the topics list (1, 2, 3...).')
						.setMinValue(1)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('import')
				.setDescription('Import topics from a JSON array file or pasted text.')
				.addAttachmentOption((option) => option.setName('file').setDescription('JSON file containing an array of topic strings.'))
				.addStringOption((option) => option.setName('text').setDescription('Paste a JSON array directly if not using a file.'))
		)
		.addSubcommand((subcommand) => subcommand.setName('export').setDescription('Export the configured topics as a JSON file.'));

export const denyInteraction = (interaction: TopicChatInputInteraction, content: string) =>
	interaction.reply({ content, flags: MessageFlags.Ephemeral });

export const formatTopicList = (topics: { id: number; value: string }[]) => topics.map((topic) => `• #${topic.id}: ${topic.value}`).join('\n');

export const normalizeTopicValue = (value: string) => value.trim();
