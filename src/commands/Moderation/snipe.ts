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

// Implements the moderation `snipe` command for recalling recently deleted messages.

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
			'Channel must be added to the allowed snipe channels bucket via `/settings channels add`.']
	},
	fullCategory: ['Moderation'],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	cooldownLimit: 3,
	cooldownDelay: 5_000,
	cooldownScope: BucketScope.Channel,
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
	requiredClientPermissions: ['SendMessages']
})
export class SnipeCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
	private readonly contexts: InteractionContextType[] = [InteractionContextType.Guild];

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: this.integrationTypes,
			contexts: this.contexts
		});
	}

	/** Handles the slash command entry-point for sniping deleted messages. */
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return replyWithComponent(interaction, 'This command can only be used in a server.', true);
		}

		if (!interaction.channel) {
			return replyWithComponent(interaction, 'This command must be used in a channel.', true);
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// Get the last deleted message for this channel
		const snipedMessage = this.container.snipeManager.getLastDeletedMessage(interaction.guildId, interaction.channel.id);

		if (!snipedMessage) {
			return editReplyWithComponent(interaction, 'No recently deleted messages found in this channel.');
		}

		// Check if channel is allowed for sniping
		const channelService = this.container.guildChannelSettingsService;
		const allowedChannels = channelService
			? await channelService.listBucket(interaction.guildId, 'allowedSnipeChannels')
			: [];

		if (!allowedChannels.includes(interaction.channel.id)) {
			return editReplyWithComponent(interaction, 'Snipe is not enabled for this channel.');
		}

		// Create component with sniped message information
		const component = this.createSnipeComponent(snipedMessage);

		// Send the snipe content to the channel
		const channel = interaction.channel as GuildTextBasedChannel;
		try {
			await channel.send({
				components: [component],
				flags: ['IsComponentsV2'],
				allowedMentions: { parse: [] }
			});
		} catch (error) {
			this.container.logger.warn('[Snipe] Failed to broadcast sniped message', error, {
				guildId: interaction.guildId,
				channelId: interaction.channel.id
			});
			return editReplyWithComponent(
				interaction,
				'I could not post the sniped message, likely due to missing permissions. Please review my channel permissions.'
			);
		}

		// Send ephemeral confirmation to the user
		return interaction.editReply({
			content: `✅ <@${interaction.user.id}> got sniped.`
		});
	}

	/** Supports the legacy message-command trigger for `j!snipe`. */
	public override async messageRun(message: Message) {
		if (!message.guildId) {
			return message.reply('This command can only be used in a server.');
		}

		// Mark this command message so the snipe manager ignores its deletion when we delete it below
		try {
			this.container.snipeManager.ignoreMessageDeletion(message.id);
			await message.delete();
		} catch (error) {
			this.container.logger.debug('[Snipe] Failed to delete invoking message', { error });
		}

		// Get the last deleted message for this channel
		const snipedMessage = this.container.snipeManager.getLastDeletedMessage(message.guildId, message.channelId);

		if (!snipedMessage) {
			const channel = message.channel as any;
			return channel.send('No recently deleted messages found in this channel.');
		}

		// Check if channel is allowed for sniping
		const channelService = this.container.guildChannelSettingsService;
		const allowedChannels = channelService
			? await channelService.listBucket(message.guildId, 'allowedSnipeChannels')
			: [];

		if (!allowedChannels.includes(message.channelId)) {
			const channel = message.channel as any;
			return channel.send('Snipe is not enabled for this channel.');
		}

		// Create component with sniped message information
		const component = this.createSnipeComponent(snipedMessage);
		const channel = message.channel as GuildTextBasedChannel;
		try {
			return await channel.send({
				components: [component],
				flags: ['IsComponentsV2'],
				allowedMentions: { parse: [] }
			});
		} catch (error) {
			this.container.logger.warn('[Snipe] Failed to broadcast sniped message (prefix command)', error, {
				guildId: message.guildId,
				channelId: message.channelId
			});
			return channel.send({
				content: 'I could not post the sniped message. Please verify my channel permissions and try again.',
				allowedMentions: { parse: [] }
			});
		}
	}

	/** Builds a V2 component payload containing the sniped message contents. */
	private createSnipeComponent(snipedMessage: SnipedMessage): ContainerBuilder {
		const container = new ContainerBuilder();

		// Build content parts
		const contentParts = [];

		// Add message content if it exists
		if (snipedMessage.content) {
			contentParts.push(snipedMessage.content.length > 1800 ? snipedMessage.content.substring(0, 1797) + '...' : snipedMessage.content);
		}

		// Add attachments if they exist
		if (snipedMessage.attachments && snipedMessage.attachments.length > 0) {
			const attachmentTexts = snipedMessage.attachments.map((att: any) => `📎 [${att.name}](${att.url}) (${this.formatFileSize(att.size)})`);
			contentParts.push(`\n**Attachments:**\n${attachmentTexts.join('\n')}`);
		}

		// Add embeds if they exist
		if (snipedMessage.embeds && snipedMessage.embeds.length > 0) {
			const embedTexts = snipedMessage.embeds.map((msgEmbed: any) => {
				const parts = [];
				if (msgEmbed.title) parts.push(`**${msgEmbed.title}**`);
				if (msgEmbed.description) parts.push(msgEmbed.description);
				if (msgEmbed.url) parts.push(`[Link](${msgEmbed.url})`);
				return parts.join('\n');
			});
			contentParts.push(`\n**Original Embeds:**\n${embedTexts.join('\n---\n')}`);
		}

		// Add message content and profile picture together using a Section with a thumbnail accessory
		const finalContent = contentParts.length > 0 ? contentParts.join('\n') : '*Message had no text content*';

		const section = new SectionBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(finalContent.length > 1900 ? finalContent.substring(0, 1897) + '...' : finalContent)
		);

		if (snipedMessage.author?.avatarURL) {
			section.setThumbnailAccessory(new ThumbnailBuilder().setURL(snipedMessage.author.avatarURL));
		}

		container.addSectionComponents(section);

		// Add separator
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		// Add author info with small text formatting (below separator)
		const createdTimestamp = Math.floor(snipedMessage.createdAt.getTime() / 1000);
		const authorInfo = `-# Original Author (${snipedMessage.author.id} / <@${snipedMessage.author.id}>) sent <t:${createdTimestamp}:R>`;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(authorInfo));

		return container;
	}

	/** Formats an attachment size into a short, human-readable string. */
	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${Math.round(bytes / (1024 * 1024))} MB`;
	}
}
