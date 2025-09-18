import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags, type SlashCommandSubcommandGroupBuilder } from 'discord.js';

export type TopicCommand = Subcommand;
export type TopicChatInputInteraction = Subcommand.ChatInputCommandInteraction;

export const MAX_TOPIC_LENGTH = 256;
export const MAX_TOPICS_PER_IMPORT = 500;
export const MAX_IMPORT_FILE_SIZE = 256_000; // 250 KB safety guard

export const registerTopicSubcommandGroup = (group: SlashCommandSubcommandGroupBuilder) =>
	group
		.setName('topic')
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
				.setDescription('Remove a topic by its identifier.')
				.addIntegerOption((option) => option.setName('id').setDescription('The identifier from the list command.').setRequired(true))
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
