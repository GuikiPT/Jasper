// tag-export module within subcommands/support/tag
import { AttachmentBuilder, MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	TagCommand,
	TagChatInputInteraction,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError,
	replyEphemeral
} from './utils';

type TagExportContext = {
	command: TagCommand;
	guildId: string | null;
	deny: (content: string) => Promise<unknown>;
	respond: (content: string, attachment?: AttachmentBuilder) => Promise<unknown>;
	defer?: () => Promise<unknown>;
};

export async function chatInputTagExport(command: TagCommand, interaction: TagChatInputInteraction) {
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

async function handleTagExport({ command, guildId, deny, respond, defer }: TagExportContext) {
	if (!guildId) {
		return deny('This command can only be used inside a server.');
	}

	if (defer) {
		await defer();
	}

	const service = command.container.supportTagService;
	if (!service) {
		command.container.logger.error('Support tag service is not initialised');
		return respond('Support tags are not available right now. Please try again later.');
	}

	try {
		const tags = await service.listTags(guildId);

		if (tags.length === 0) {
			return respond('No tags configured yet. Create one with `/tag create`.');
		}

		// Convert to the format from the attached JSON file
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
