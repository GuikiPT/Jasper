// support-set module within subcommands/settings/support
import type { Args } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';
import {
	executeSupportSet,
	denyInteraction,
	parseSetting,
	parseSettingChoice,
	formatError,
	type SupportCommand,
	type SupportChatInputInteraction
} from './utils';

export async function messageSupportSet(command: SupportCommand, message: Message, args: Args) {
	try {
		const setting = await parseSetting(args);
		const value = await args.restResult('string');

		return executeSupportSet({
			command,
			guildId: message.guild?.id ?? null,
			setting,
			value: value.isOk() ? value.unwrap() : null,
			deny: (content) => message.reply(content),
			respond: (content) => message.reply(content)
		});
	} catch (error) {
		return message.reply(formatError(error));
	}
}

export async function chatInputSupportSet(command: SupportCommand, interaction: SupportChatInputInteraction) {
	try {
		const settingValue = interaction.options.getString('setting', true);
		const setting = parseSettingChoice(settingValue);
		const value = interaction.options.getString('value', false);

		return executeSupportSet({
			command,
			guildId: interaction.guild?.id ?? null,
			setting,
			value,
			deny: (content) => denyInteraction(interaction, content),
			respond: (content) => interaction.editReply({ content }),
			defer: () => interaction.deferReply({ flags: MessageFlags.Ephemeral })
		});
	} catch (error) {
		return denyInteraction(interaction, formatError(error));
	}
}
