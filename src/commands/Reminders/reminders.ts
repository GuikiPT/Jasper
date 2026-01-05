import { ApplyOptions } from '@sapphire/decorators';
import { Args, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { Message } from 'discord.js';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	SlashCommandBuilder,
	SlashCommandStringOption
} from 'discord.js';
import {
	chatInputReminderList,
	chatInputReminderDelete,
	chatInputReminderEdit,
	messageReminderList,
	messageReminderDelete,
	messageReminderEdit
} from '../../subcommands/reminders/reminder-index.js';

@ApplyOptions<Subcommand.Options>({
	name: 'reminders',
	aliases: ['reminder'],
	description: 'Manage your reminders',
	detailedDescription: {
		summary: 'List, edit, or delete your reminders',
		chatInputUsage: '/reminders <subcommand>',
		messageUsage: '{{prefix}}reminders <subcommand>',
		examples: ['/reminders list', '/reminders delete id:123', '/reminders edit id:123 message:"new message"'],
		notes: ['You can only manage your own reminders']
	},
	fullCategory: ['Reminders'],
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
	],
	subcommands: [
		{ name: 'list', chatInputRun: 'chatInputList', messageRun: 'messageList' },
		{ name: 'delete', chatInputRun: 'chatInputDelete', messageRun: 'messageDelete' },
		{ name: 'edit', chatInputRun: 'chatInputEdit', messageRun: 'messageEdit' }
	]
})
export class UserCommand extends Subcommand {
	private readonly integrationTypes: ApplicationIntegrationType[] = [
		ApplicationIntegrationType.GuildInstall,
		ApplicationIntegrationType.UserInstall
	];

	private readonly contexts: InteractionContextType[] = [
		InteractionContextType.Guild,
		InteractionContextType.BotDM,
		InteractionContextType.PrivateChannel
	];

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		const command = new SlashCommandBuilder()
			.setName(this.name)
			.setDescription(this.description)
			.setIntegrationTypes(this.integrationTypes)
			.setContexts(this.contexts)
			.addSubcommand((subcommand) =>
				subcommand.setName('list').setDescription('List all your active reminders')
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName('delete')
					.setDescription('Delete a reminder')
					.addStringOption((option: SlashCommandStringOption) =>
						option.setName('id').setDescription('The reminder ID to delete').setRequired(true).setAutocomplete(true)
					)
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName('edit')
					.setDescription('Edit a reminder')
					.addStringOption((option: SlashCommandStringOption) =>
						option.setName('id').setDescription('The reminder ID to edit').setRequired(true).setAutocomplete(true)
					)
					.addStringOption((option: SlashCommandStringOption) =>
						option.setName('when').setDescription('New time (e.g., "in 1 hour")').setRequired(false)
					)
					.addStringOption((option: SlashCommandStringOption) =>
						option.setName('message').setDescription('New message').setRequired(false).setMaxLength(1000)
					)
			);

		registry.registerChatInputCommand(command, { idHints: [] });
	}

	public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction) {
		return chatInputReminderList.call(this, interaction);
	}

	public async chatInputDelete(interaction: Subcommand.ChatInputCommandInteraction) {
		return chatInputReminderDelete.call(this, interaction);
	}

	public async chatInputEdit(interaction: Subcommand.ChatInputCommandInteraction) {
		return chatInputReminderEdit.call(this, interaction);
	}

	public async messageList(message: Message, args: Args) {
		return messageReminderList.call(this, message, args);
	}

	public async messageDelete(message: Message, args: Args) {
		return messageReminderDelete.call(this, message, args);
	}

	public async messageEdit(message: Message, args: Args) {
		return messageReminderEdit.call(this, message, args);
	}
}
