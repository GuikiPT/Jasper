// automod-check-pagination module within interaction-handlers
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';

// Constants for automod-check pagination
const AUTOMOD_CHECK_CUSTOM_ID = 'automod-check';

interface PaginationMetadata {
	ownerId: string;
	targetPage: number;
	content: string;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class AutomodCheckPaginationHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const segments = interaction.customId.split(':');
		if (segments.length !== 4) {
			return this.none();
		}

		const [base, ownerId, action, rawPage] = segments;
		if (base !== AUTOMOD_CHECK_CUSTOM_ID) {
			return this.none();
		}

		if (!ownerId || (action !== 'prev' && action !== 'next')) {
			return this.none();
		}

		const targetPage = Number.parseInt(rawPage, 10);
		if (!Number.isFinite(targetPage)) {
			return this.none();
		}

		// Extract the original content from the message
		const message = interaction.message;
		let content = '';

		// Try to extract content from the first container's components
		if (message.components && message.components.length > 0) {
			const firstContainer = message.components[0] as any;
			if (firstContainer.components) {
				for (const component of firstContainer.components) {
					if (component.type === 10 && component.content && component.content.includes('**📝 Checked Content:**')) {
						// Extract content from code block
						const match = component.content.match(/```\n(.*?)\n```/s);
						if (match) {
							content = match[1];
							break;
						}
					}
				}
			}
		}

		return this.some<PaginationMetadata>({ ownerId, targetPage: Math.max(1, targetPage), content });
	}

	public override async run(interaction: ButtonInteraction, data: PaginationMetadata) {
		if (interaction.user.id !== data.ownerId) {
			return interaction.reply({
				content: 'Only the user who ran this command can use these controls.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (!data.content) {
			return interaction.reply({
				content: 'Unable to extract the original content for pagination. Please run the command again.',
				flags: MessageFlags.Ephemeral
			});
		}

		try {
			// Re-run the automod check with the original content
			const result = this.container.automodRuleChecker.checkContent(data.content);

			// Get the command instance from the container
			const commandStore = this.container.stores.get('commands');
			const commandInstance = commandStore.get('automod-check') as any;

			if (!commandInstance) {
				throw new Error('AutomodCheckCommand not found in store');
			}

			// Create components with the requested page
			const components = await commandInstance.createResultComponents(data.content, result, data.ownerId, data.targetPage);

			return interaction.update({ components });
		} catch (error) {
			this.container.logger.error('[AutomodCheckPagination] Failed to paginate results', error, {
				userId: interaction.user.id,
				content: data.content.substring(0, 100),
				targetPage: data.targetPage
			});

			return interaction.reply({
				content: 'An error occurred while updating the automod results. Please try running the command again.',
				flags: MessageFlags.Ephemeral
			});
		}
	}
}
