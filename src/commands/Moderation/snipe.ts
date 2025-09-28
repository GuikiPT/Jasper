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

@ApplyOptions<Command.Options>({
	name: 'snipe',
	description: 'Show the last deleted message in this channel.',
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
		const channelSettings = await this.container.database.guildChannelSettings.findUnique({
			where: { guildId: interaction.guildId }
		});

		const allowedChannels = channelSettings ? this.parseStringArray(channelSettings.allowedSnipeChannels) : [];

		if (!allowedChannels.includes(interaction.channel.id)) {
			return editReplyWithComponent(interaction, 'Snipe is not enabled for this channel.');
		}

		// Create component with sniped message information
		const component = this.createSnipeComponent(snipedMessage);

		// Send the snipe content to the channel
		const channel = interaction.channel as GuildTextBasedChannel;
		await channel.send({
			components: [component],
			flags: MessageFlags.IsComponentsV2
		});

		// Send ephemeral confirmation to the user
		return interaction.editReply({
			content: `✅ <@${interaction.user.id}> got sniped.`
		});
	}

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
		const channelSettings = await this.container.database.guildChannelSettings.findUnique({
			where: { guildId: message.guildId }
		});

		const allowedChannels = channelSettings ? this.parseStringArray(channelSettings.allowedSnipeChannels) : [];

		if (!allowedChannels.includes(message.channelId)) {
			const channel = message.channel as any;
			return channel.send('Snipe is not enabled for this channel.');
		}

		// Create component with sniped message information
		const component = this.createSnipeComponent(snipedMessage);
		const channel = message.channel as any;
		return channel.send({
			components: [component],
			flags: MessageFlags.IsComponentsV2
		});
	}

	private createSnipeComponent(snipedMessage: any): ContainerBuilder {
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

	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${Math.round(bytes / (1024 * 1024))} MB`;
	}

	private parseStringArray(value: string | null | undefined): string[] {
		if (!value) return [];
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
		} catch {
			return [];
		}
	}
}
