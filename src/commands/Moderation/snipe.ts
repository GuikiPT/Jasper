// snipe module within commands/Moderation
import { ApplyOptions } from '@sapphire/decorators';
import { BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	SectionBuilder,
	ThumbnailBuilder,
	type Message,
	type GuildTextBasedChannel
} from 'discord.js';
import { replyWithComponent, editReplyWithComponent } from '../../lib/components.js';
import type { SnipedMessage } from '../../services/snipeManager';

// Command for retrieving recently deleted messages in allowed channels
@ApplyOptions<Command.Options>({
	name: 'snipe',
	description: 'Show the last deleted message in this channel.',
	detailedDescription: {
		summary: 'Retrieves the most recent deleted message, including attachments and embeds, if the channel allows sniping.',
		chatInputUsage: '/snipe',
		messageUsage: '{{prefix}}snipe',
		examples: ['/snipe', '{{prefix}}snipe'],
		notes: [
			'Only staff and admin buckets can use this command.',
			'Channel must be added to the allowed snipe channels bucket via `/settings channels add`.'
		]
	},
	fullCategory: ['Moderation'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 3,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.Channel,
	// Restrict to staff and admin roles
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['allowedStaffRoles', 'allowedAdminRoles'] as const,
				allowManageGuild: false,
				errorMessage: 'You need staff or admin permissions to use the snipe command.'
			}
		}
	],
	// requiredClientPermissions: ['SendMessages']
})
export class SnipeCommand extends Command {
	// Guild-only installation and execution
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	// Register simple /snipe slash command
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: this.integrationTypes,
			contexts: this.contexts
		});
	}

	// Handle /snipe: retrieve deleted message and post to channel
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (!interaction.guildId || !interaction.channel) {
			return replyWithComponent(interaction, 'This command can only be used in a guild channel.', true);
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// Retrieve last deleted message for this channel
		const snipedMessage = this.container.snipeManager.getLastDeletedMessage(interaction.guildId, interaction.channel.id);
		if (!snipedMessage) {
			return editReplyWithComponent(interaction, 'No recently deleted messages found in this channel.');
		}

		// Verify channel is in allowlist
		const isAllowed = await this.isChannelAllowed(interaction.guildId, interaction.channel.id);
		if (!isAllowed) {
			return editReplyWithComponent(interaction, 'Snipe is not enabled for this channel.');
		}

		// Build and send snipe component to channel
		const success = await this.sendSnipeToChannel(interaction.channel as GuildTextBasedChannel, snipedMessage);
		if (!success) {
			return editReplyWithComponent(
				interaction,
				'I could not post the sniped message, likely due to missing permissions. Please review my channel permissions.'
			);
		}

		// Confirm to user ephemerally
		return interaction.editReply({
			content: `✅ <@${interaction.user.id}> got sniped.`
		});
	}

	// Handle prefix command: delete invoking message and post snipe
	public override async messageRun(message: Message) {
		if (!message.guildId) {
			return message.reply('This command can only be used in a server.');
		}

		// Mark and delete the command message
		this.container.snipeManager.ignoreMessageDeletion(message.id);
		try {
			await message.delete();
		} catch (error) {
			this.container.logger.debug('[Snipe] Failed to delete invoking message', { error });
		}

		// Retrieve last deleted message
		const snipedMessage = this.container.snipeManager.getLastDeletedMessage(message.guildId, message.channelId);
		if (!snipedMessage) {
			return (message.channel as any).send('No recently deleted messages found in this channel.');
		}

		// Verify channel is in allowlist
		const isAllowed = await this.isChannelAllowed(message.guildId, message.channelId);
		if (!isAllowed) {
			return (message.channel as any).send('Snipe is not enabled for this channel.');
		}

		// Build and send snipe component
		const success = await this.sendSnipeToChannel(message.channel as GuildTextBasedChannel, snipedMessage);
		if (!success) {
			return (message.channel as GuildTextBasedChannel).send({
				content: 'I could not post the sniped message. Please verify my channel permissions and try again.',
				allowedMentions: { parse: [] }
			});
		}
	}

	// Check if channel is in the allowed snipe channels list
	private async isChannelAllowed(guildId: string, channelId: string): Promise<boolean> {
		const channelService = this.container.guildChannelSettingsService;
		if (!channelService) return false;

		const allowedChannels = await channelService.listBucket(guildId, 'allowedSnipeChannels');
		return allowedChannels.includes(channelId);
	}

	// Send the snipe component to the channel, return success status
	private async sendSnipeToChannel(channel: GuildTextBasedChannel, snipedMessage: SnipedMessage): Promise<boolean> {
		try {
			const component = this.buildSnipeComponent(snipedMessage);
			await channel.send({
				components: [component],
				flags: ['IsComponentsV2'],
				allowedMentions: { parse: [] }
			});
			return true;
		} catch (error) {
			this.container.logger.warn('[Snipe] Failed to broadcast sniped message', error, {
				channelId: channel.id
			});
			return false;
		}
	}

	// Build Components v2 container displaying the sniped message
	private buildSnipeComponent(snipedMessage: SnipedMessage): ContainerBuilder {
		const container = new ContainerBuilder();

		// Build message content with attachments and embeds
		const content = this.buildMessageContent(snipedMessage);

		// Create section with content and author avatar thumbnail
		const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
		if (snipedMessage.author?.avatarURL) {
			section.setThumbnailAccessory(new ThumbnailBuilder().setURL(snipedMessage.author.avatarURL));
		}
		container.addSectionComponents(section);

		// Add separator before footer
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		// Add author metadata footer
		const createdTimestamp = Math.floor(snipedMessage.createdAt.getTime() / 1000);
		const authorInfo = `-# Original Author (${snipedMessage.author.id} / <@${snipedMessage.author.id}>) sent <t:${createdTimestamp}:R>`;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(authorInfo));

		return container;
	}

	// Build the full message content including text, attachments, and embeds
	private buildMessageContent(snipedMessage: SnipedMessage): string {
		const parts: string[] = [];

		// Add message text content
		if (snipedMessage.content) {
			const truncated = snipedMessage.content.length > 1800
				? snipedMessage.content.substring(0, 1797) + '...'
				: snipedMessage.content;
			parts.push(truncated);
		}

		// Add attachment links
		if (snipedMessage.attachments?.length > 0) {
			const attachmentLines = snipedMessage.attachments.map(
				(att) => `📎 [${att.name}](${att.url}) (${this.formatFileSize(att.size)})`
			);
			parts.push(`\n**Attachments:**\n${attachmentLines.join('\n')}`);
		}

		// Add embed summaries
		if (snipedMessage.embeds?.length > 0) {
			const embedLines = snipedMessage.embeds.map((embed) => {
				const embedParts: string[] = [];
				if (embed.title) embedParts.push(`**${embed.title}**`);
				if (embed.description) embedParts.push(embed.description);
				if (embed.url) embedParts.push(`[Link](${embed.url})`);
				return embedParts.join('\n');
			});
			parts.push(`\n**Original Embeds:**\n${embedLines.join('\n---\n')}`);
		}

		// Fallback if message has no content
		const finalContent = parts.length > 0 ? parts.join('\n') : '*Message had no text content*';
		return finalContent.length > 1900 ? finalContent.substring(0, 1897) + '...' : finalContent;
	}

	// Format file size into human-readable string
	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${Math.round(bytes / (1024 * 1024))} MB`;
	}
}
