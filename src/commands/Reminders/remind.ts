import { ApplyOptions } from '@sapphire/decorators';
import { Args, BucketScope, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Duration } from '@sapphire/duration';
import type { Message } from 'discord.js';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	SlashCommandBuilder,
	SlashCommandStringOption,
	MessageFlags,
	ChannelType,
	PermissionFlagsBits,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize
} from 'discord.js';
import { generateShortUuid } from '../../lib/reminderUtils';

@ApplyOptions<Command.Options>({
	name: 'remind',
	aliases: ['reminder'],
	description: 'Set a reminder for yourself',
	detailedDescription: {
		summary: 'Create a reminder that will notify you after a specified duration',
		chatInputUsage: '/remind when:"in 1 hour" message:"update my vps"',
		messageUsage: '{{prefix}}remind <when> <message>',
		examples: [
			'/remind when:"in 30 minutes" message:"check on deployment"',
			'/remind when:"in 2 hours and 15 minutes" message:"meeting"',
			'{{prefix}}remind in 1 hour check the server'
		],
		notes: ['Time formats: "in X minutes/hours/days", "in X min", "in X h", etc.']
	},
	fullCategory: ['Reminders'],
	cooldownScope: BucketScope.User,
	runIn: [CommandOptionsRunTypeEnum.GuildAny, CommandOptionsRunTypeEnum.Dm],
	preconditions: [
		{
			name: 'AllowedGuildRoleBuckets',
			context: {
				buckets: ['supportRoles', 'allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'] as const,
				allowManageGuild: false,
				errorMessage: 'Reminder commands may only be used by users with "Support Roles", "Tag Roles", "Staff Roles", or "Admin Roles".'
			}
		}
	]
})
export class UserCommand extends Command {
	private readonly integrationTypes: ApplicationIntegrationType[] = [
		ApplicationIntegrationType.GuildInstall,
		ApplicationIntegrationType.UserInstall
	];

	private readonly contexts: InteractionContextType[] = [
		InteractionContextType.Guild,
		InteractionContextType.BotDM,
		InteractionContextType.PrivateChannel
	];

	public override registerApplicationCommands(registry: Command.Registry) {
		const command = new SlashCommandBuilder()
			.setName(this.name)
			.setDescription(this.description)
			.setIntegrationTypes(this.integrationTypes)
			.setContexts(this.contexts)
			.addStringOption((option: SlashCommandStringOption) =>
				option
					.setName('when')
					.setDescription('When to remind you (e.g., "in 1 hour", "in 30 minutes")')
					.setRequired(true)
			)
			.addStringOption((option: SlashCommandStringOption) =>
				option
					.setName('message')
					.setDescription('What to remind you about')
					.setRequired(true)
					.setMaxLength(1000)
			);

		registry.registerChatInputCommand(command, { idHints: [] });
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const whenString = interaction.options.getString('when', true);
		const message = interaction.options.getString('message', true);

		// Parse the duration from the input
		const duration = new Duration(whenString);
		const milliseconds = duration.offset;

		if (milliseconds <= 0 || isNaN(milliseconds)) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent('❌ Invalid time format. Please use formats like "in 1 hour", "in 30 minutes", "in 2 days", etc.')
			);

			return interaction.reply({
				components: [container],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}

		// Check if duration is too far in the future (max 1 year)
		const maxDuration = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
		if (milliseconds > maxDuration) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Reminder duration cannot exceed 1 year.'));

			return interaction.reply({
				components: [container],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}

		// Check if user can receive DMs using empty message test
		// Forbidden error (50007) = can't DM (DMs closed)
		// HTTPException (like 50006 empty message) = can DM (DMs open)
		let canSendDM = true; // Assume DMs are open by default
		try {
			await interaction.user.send({ content: '' });
		} catch (error: any) {
			// Check if it's a "Cannot send messages to this user" error (DMs closed)
			if (error.code === 50007 || error.httpStatus === 403) {
				canSendDM = false;
			}
			// Any other error (including 50006 for empty message) means DMs are open
			this.container.logger.debug('DM test message error (assuming DMs open):', {
				name: error?.name,
				message: error?.message,
				code: error?.code,
				httpStatus: error?.httpStatus,
				stack: error?.stack
			});
		}

		// If DMs are closed, verify bot can send to the channel
		let reminderChannelId = interaction.channelId;
		if (!canSendDM) {
			// Check if in a guild channel
			if (!interaction.inGuild() || !interaction.channel) {
				const container = new ContainerBuilder();
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						'❌ I cannot send you DMs and this is not a guild channel. Please enable DMs or use this command in a server channel where I have permission to send messages.'
					)
				);

				return interaction.reply({
					components: [container],
					flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
				});
			}

			// Check bot permissions in the channel
			const channel = interaction.channel;
			if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
				const permissions = channel.permissionsFor(interaction.client.user!);
				if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages)) {
					const container = new ContainerBuilder();
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(
							'❌ I cannot send you DMs and I do not have permission to send messages in this channel. Please enable DMs or use this command in a channel where I have permission to send messages.'
						)
					);

					return interaction.reply({
						components: [container],
						flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
					});
				}
			}
		}

		// Calculate the remind time
		const remindAt = new Date(Date.now() + milliseconds);

		try {
			// Generate unique short UUID
			let uuid = generateShortUuid();

			// Ensure UUID is unique (retry if collision)
			let attempts = 0;
			while (attempts < 5) {
				const existing = await this.container.database.reminder.findUnique({
					where: { uuid }
				});
				if (!existing) break;
				uuid = generateShortUuid();
				attempts++;
			}

			// Create reminder in database
			const reminder = await this.container.database.reminder.create({
				data: {
					uuid,
					userId: interaction.user.id,
					guildId: interaction.guildId,
					channelId: canSendDM ? interaction.channelId : reminderChannelId,
					message: message,
					remindAt: remindAt
				}
			});

			// Build success message with same structure as reminder delivery
			const deliveryNote = canSendDM ? 'Reminder will be sent via DM' : 'Reminder will be sent in this channel';

			const components = [
				new ContainerBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent('### ✅ Reminder Set')
					)
					.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
					)
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`***You asked me to remind you about:***\n> ${message}`)
					)
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`-# ${reminder.uuid} • <t:${Math.floor(remindAt.getTime() / 1000)}:R> • ${deliveryNote}`)
					)
			];

			return interaction.reply({
				components,
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		} catch (error) {
			this.container.logger.error('Error creating reminder:', error);

			const container = new ContainerBuilder();
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent('❌ An error occurred while creating your reminder. Please try again.')
			);

			return interaction.reply({
				components: [container],
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
		}
	}

	public override async messageRun(message: Message, args: Args) {
		// Resolve prefix for error messages
		const prefix = await this.resolvePrefix(message.guildId);

		// Parse the "when" and "message" from the content
		// The Duration parser is flexible and can handle various formats
		const content = await args.rest('string').catch(() => '');
		if (!content.trim()) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`❌ Please provide a duration and reminder message.\n**Usage:** \`${prefix}remind <when> <message>\`\n**Example:** \`${prefix}remind in 1 hour check the server\``)
			);

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Try to split on "to" as a natural separator (e.g., "in 2 minutes to test something")
		let whenString: string;
		let reminderMessage: string;

		const toSplit = content.split(/\s+to\s+/i);
		if (toSplit.length >= 2 && toSplit[0]) {
			// Try parsing the first part as duration
			const testDuration = new Duration(toSplit[0]);
			if (!isNaN(testDuration.offset) && testDuration.offset > 0) {
				whenString = toSplit[0];
				reminderMessage = toSplit.slice(1).join(' to ');
			} else {
				// "to" split didn't work, try progressive parsing
				const result = this.parseTimeAndMessage(content);
				if (!result) {
					const container = new ContainerBuilder();
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`❌ Could not parse the duration from: "${content}"\n**Example:** \`${prefix}remind in 1 hour check the server\``)
					);

					return message.reply({
						components: [container],
						flags: MessageFlags.IsComponentsV2
					});
				}
				whenString = result.time;
				reminderMessage = result.message;
			}
		} else {
			// No "to" separator, try progressive parsing
			const result = this.parseTimeAndMessage(content);
			if (!result) {
				const container = new ContainerBuilder();
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`❌ Could not parse the duration from: "${content}"\n**Example:** \`${prefix}remind in 1 hour check the server\``)
				);

				return message.reply({
					components: [container],
					flags: MessageFlags.IsComponentsV2
				});
			}
			whenString = result.time;
			reminderMessage = result.message;
		}

		if (!reminderMessage) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`❌ Please provide a reminder message after the duration.\n**Example:** \`${prefix}remind in 1 hour check the server\``)
			);

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Parse the duration
		const duration = new Duration(whenString);
		const milliseconds = duration.offset;

		if (isNaN(milliseconds) || milliseconds <= 0) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`❌ Invalid duration format: "${whenString}"\n**Example formats:** "in 30 minutes", "in 2 hours", "in 1 day"`)
			);

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Check if duration is too short (min 1 minute)
		if (milliseconds < 60_000) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Reminder duration must be at least 1 minute.'));

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Check if duration is too far in the future (max 1 year)
		const maxDuration = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
		if (milliseconds > maxDuration) {
			const container = new ContainerBuilder();
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Reminder duration cannot exceed 1 year.'));

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2
			});
		}

		// Check if user can receive DMs using empty message test
		let canSendDM = true;
		try {
			await message.author.send({ content: '' });
		} catch (error: any) {
			if (error.code === 50007 || error.httpStatus === 403) {
				canSendDM = false;
			}
			this.container.logger.debug('DM test message error (assuming DMs open):', {
				name: error?.name,
				message: error?.message,
				code: error?.code,
				httpStatus: error?.httpStatus,
				stack: error?.stack
			});
		}

		// If DMs are closed, verify bot can send to the channel
		let reminderChannelId = message.channelId;
		if (!canSendDM) {
			// Check if in a guild channel
			if (!message.inGuild() || !message.channel) {
				const container = new ContainerBuilder();
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						'❌ I cannot send you DMs and this is not a guild channel. Please enable DMs or use this command in a server channel where I have permission to send messages.'
					)
				);

				return message.reply({
					components: [container],
					flags: MessageFlags.IsComponentsV2
				});
			}

			// Check bot permissions in the channel
			const channel = message.channel;
			if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
				const permissions = channel.permissionsFor(message.client.user!);
				if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages)) {
					const container = new ContainerBuilder();
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(
							'❌ I cannot send you DMs and I do not have permission to send messages in this channel. Please enable DMs or use this command in a channel where I have permission to send messages.'
						)
					);

					return message.reply({
						components: [container],
						flags: MessageFlags.IsComponentsV2
					});
				}
			}
		}

		// Calculate the remind time
		const remindAt = new Date(Date.now() + milliseconds);

		try {
			// Generate unique short UUID
			let uuid = generateShortUuid();

			// Ensure UUID is unique (retry if collision)
			let attempts = 0;
			while (attempts < 5) {
				const existing = await this.container.database.reminder.findUnique({
					where: { uuid }
				});
				if (!existing) break;
				uuid = generateShortUuid();
				attempts++;
			}

			// Create reminder in database
			const reminder = await this.container.database.reminder.create({
				data: {
					uuid,
					userId: message.author.id,
					guildId: message.guildId,
					channelId: canSendDM ? message.channelId : reminderChannelId,
					message: reminderMessage,
					remindAt: remindAt
				}
			});

			// Build success message
			const deliveryNote = canSendDM ? 'Reminder will be sent via DM' : 'Reminder will be sent in this channel';

			const components = [
				new ContainerBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent('### ✅ Reminder Set')
					)
					.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
					)
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`***You asked me to remind you about:***\n> ${reminderMessage}`)
					)
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`-# ${reminder.uuid} • <t:${Math.floor(remindAt.getTime() / 1000)}:R> • ${deliveryNote}`)
					)
			];

			return message.reply({
				components,
				flags: MessageFlags.IsComponentsV2
			});
		} catch (error) {
			this.container.logger.error('Error creating reminder:', error);

			const container = new ContainerBuilder();
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent('❌ An error occurred while creating your reminder. Please try again.')
			);

			return message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2
			});
		}
	}

	// Parse time and message by trying progressively longer substrings with Duration
	private parseTimeAndMessage(content: string): { time: string; message: string } | null {
		const words = content.split(/\s+/);

		// Try parsing progressively longer substrings (2 to length-1 words)
		for (let i = 2; i < words.length; i++) {
			const timeStr = words.slice(0, i).join(' ');
			const messageStr = words.slice(i).join(' ');

			const duration = new Duration(timeStr);
			// Valid duration: has offset > 0 and the remaining text is not empty
			if (!isNaN(duration.offset) && duration.offset > 0 && messageStr.trim().length > 0) {
				return { time: timeStr, message: messageStr };
			}
		}

		return null;
	}

	// Helper method to resolve prefix for error messages
	private async resolvePrefix(guildId: string | null): Promise<string> {
		const defaultPrefix = this.extractDefaultPrefix();

		if (!guildId) {
			return defaultPrefix;
		}

		try {
			const customPrefix = await this.container.guildSettingsService.getPrefix(guildId);
			return customPrefix ?? defaultPrefix;
		} catch (error) {
			this.container.logger.warn('[Remind] Failed to fetch guild prefix; falling back to default', error, {
				guildId
			});
			return defaultPrefix;
		}
	}

	private extractDefaultPrefix(): string {
		const option = this.container.client.options.defaultPrefix;
		if (typeof option === 'string') return option;
		if (Array.isArray(option) && option.length > 0) return option[0]!;
		return 'j!';
	}
}
