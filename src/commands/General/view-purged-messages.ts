import { Command } from '@sapphire/framework';
import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';

export class ViewPurgedMessagesCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: 'View Purged Messages',
			description: 'View purged messages from a GearBot archive in a visual format',
			preconditions: [
				{
					name: 'AllowedGuildRoleBuckets',
					context: {
						buckets: ['allowedAdminRoles', 'allowedStaffRoles'] as const,
						allowManageGuild: true,
						errorMessage: 'You need an allowed admin or staff role to use this command.'
					}
				}
			]
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		const command = new ContextMenuCommandBuilder()
			.setName(this.name)
			.setType(ApplicationCommandType.Message)
			.setDMPermission(false);

		registry.registerContextMenuCommand(command);
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction): Promise<void> {
		if (!interaction.isMessageContextMenuCommand()) return;

		await interaction.deferReply({ ephemeral: true });

		try {
			const message = interaction.targetMessage;

			// Find .txt attachment
			const txtAttachment = message.attachments.find(
				(att) => att.contentType === 'text/plain; charset=utf-8' || att.name?.endsWith('.txt')
			);

			if (!txtAttachment) {
				await interaction.editReply({
					content: '❌ No text file found in this message. This command only works with purged message archives.'
				});
				return;
			}

			// Download and parse the file
			const response = await fetch(txtAttachment.url);
			const text = await response.text();

			// Parse the purged messages
			const lines = text.split('\n').filter((line) => line.trim());
			if (lines.length === 0) {
				await interaction.editReply({
					content: '❌ The archive file is empty.'
				});
				return;
			}

			// Extract header info (first line typically has metadata)
			const headerMatch = lines[0].match(/purged at (\d{2}:\d{2}:\d{2}) from (.+)/);
			const purgedTime = headerMatch ? headerMatch[1] : 'Unknown';
			const channelName = headerMatch ? headerMatch[2] : 'Unknown';

			// Parse message lines
			const messages = lines.slice(1).map((line) => {
				const parts = line.split(' | ');
				if (parts.length < 3) return null;

				// Parse timestamp and IDs
				const [timestampAndIds, userInfo, content, ...rest] = parts;
				const [timestamp, , , messageId] = timestampAndIds.split(/\s+|-\s+/);

				// Parse user info
				const userMatch = userInfo.match(/(.+?)#(\d+)\s+\((\d+)\)/);
				const username = userMatch ? userMatch[1] : userInfo;
				const discriminator = userMatch ? userMatch[2] : '0';
				const userId = userMatch ? userMatch[3] : null;

				// Check for reply
				const replyInfo = rest.find((part) => part.includes('In reply to'));

				return {
					timestamp: timestamp?.trim(),
					messageId: messageId?.trim(),
					username,
					discriminator,
					userId,
					content,
					isReply: !!replyInfo,
					avatarUrl: undefined as string | undefined
				};
			})
				.filter((msg): msg is NonNullable<typeof msg> => msg !== null);

			// Fetch avatars for users with IDs
			const uniqueUserIds = [...new Set(messages.map(m => m.userId).filter((id): id is string => id !== null))];
			const avatarMap = new Map<string, string>();

			for (const userId of uniqueUserIds) {
				try {
					const user = await this.container.client.users.fetch(userId);
					avatarMap.set(userId, user.displayAvatarURL({ extension: 'png', size: 128 }));
				} catch (error) {
					// If we can't fetch the user, use default avatar calculation
					const defaultIndex = Number((BigInt(userId) >> 22n) % 6n);
					avatarMap.set(userId, `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`);
				}
			}

			// Apply avatars to messages
			messages.forEach(msg => {
				if (msg.userId) {
					msg.avatarUrl = avatarMap.get(msg.userId);
				}
			});

			if (messages.length === 0) {
				await interaction.editReply({
					content: '❌ Could not parse any messages from the archive.'
				});
				return;
			}

			// Store the data in cache and generate short URL (5 minutes TTL)
			const cacheId = this.container.purgedMessagesCache.set({
				purgedTime,
				channelName,
				messages
			}, 300000);

			// Get API base URL from environment or use default
			const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 27010}`;
			const viewUrl = `${apiBaseUrl}/purged/${cacheId}`;

			// Debug log
			this.container.logger.debug('[View Purged Messages] Generated URL:', { apiBaseUrl, viewUrl });

			await interaction.editReply({
				components: [
					{
						type: 1,
						components: [
							{
								type: 2,
								style: 5,
								label: 'View Messages',
								url: viewUrl,
								emoji: { name: '👁️' }
							}
						]
					}
				]
			});
		} catch (error) {
			this.container.logger.error('[View Purged Messages] Error processing command:', error);
			await interaction.editReply({
				content: '❌ An error occurred while processing the archive. Please make sure it\'s a valid purged messages file.'
			});
		}
	}
}
