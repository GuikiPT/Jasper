// Tag export subcommand - exports all tags as JSON file
import { AttachmentBuilder, MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	replyEphemeral
} from './utils';

// Context for tag export operation
type TagExportContext = {
	command: TagCommand;
	guildId: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string, attachment?: AttachmentBuilder) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

// Handle /tag export - downloads all tags as JSON
export async function chatInputTagExport(command: TagCommand, interaction: TagChatInputInteraction) {
	// Validate guild context
	const guildId = interaction.guildId;
	if (!guildId) {
		return replyEphemeral(interaction, 'This command can only be used inside a server.');
	}

	return handleTagExport({
		command,
		guildId,
		deny: (content) => replyEphemeral(interaction, content),
		respond: (content, attachment) => (attachment ? interaction.editReply({ content, files: [attachment] }) : interaction.editReply({ content })),
		defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
	});
}

// Execute tag export workflow
async function handleTagExport({ command, guildId, deny, respond, defer }: TagExportContext) {
	// Validate guild context
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	// Get support tag service
	const service = command.container.supportTagService;
	if (!service) {
		command.container.logger.error('Support tag service is not initialised');
		return respond('Support tags are not available right now. Please try again later.');
	}

	try {
		// Fetch all tags for guild
		const tags = await service.listTags(guildId);

		if (tags.length === 0) {
			return respond('No tags configured yet. Create one with `/tag create`.');
		}

		// Convert tags to export format
		const exportData: Record<
			string,
			{
				name: string;
				title: string;
				description: string | null;
				footer: string | null;
				imageUrl: string | null;
			}
		> = {};

		for (const tag of tags) {
			exportData[tag.name] = {
				name: tag.name,
				title: tag.embedTitle,
				description: tag.embedDescription,
				footer: tag.embedFooter,
				imageUrl: tag.embedImageUrl
			};
		}

		// Create JSON file attachment
		const payload = JSON.stringify(exportData, null, 2);
		const attachment = new AttachmentBuilder(Buffer.from(`${payload}\n`, 'utf8'), {
			name: 'support-tags.json'
		});

		return respond(`Exported ${tags.length} tag${tags.length === 1 ? '' : 's'}.`, attachment);
	} catch (error) {
		if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
			return respond(SUPPORT_TAG_TABLE_MISSING_MESSAGE);
		}
		command.container.logger.error('Failed to export support tags', error);
		return respond('Unable to export tags right now. Please try again later.');
	}
}
