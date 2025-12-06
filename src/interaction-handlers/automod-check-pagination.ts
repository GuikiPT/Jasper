// Automod-check pagination handler - handles page navigation for rule results
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';

// Custom ID prefix for automod-check pagination buttons
const AUTOMOD_CHECK_CUSTOM_ID = 'automod-check';

// Parsed pagination metadata from button custom ID
interface PaginationMetadata {
	ownerId: string;
	targetPage: number;
	content: string;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class AutomodCheckPaginationHandler extends InteractionHandler {
	// Parse button custom ID and extract pagination metadata
	public override parse(interaction: ButtonInteraction) {
		// Expected format: automod-check:ownerId:action:page
		const segments = interaction.customId.split(':');
		if (segments.length !== 4) {
			return this.none();
		}

		const [base, ownerId, action, rawPage] = segments;

		// Validate custom ID prefix
		if (base !== AUTOMOD_CHECK_CUSTOM_ID) {
			return this.none();
		}

		// Validate action type
		if (!ownerId || (action !== 'prev' && action !== 'next')) {
			return this.none();
		}

		// Parse target page number
		const targetPage = Number.parseInt(rawPage, 10);
		if (!Number.isFinite(targetPage)) {
			return this.none();
		}

		// Extract original content from message components
		const message = interaction.message;
		let content = '';

		// Try to extract content from the first container's components
		if (message.components && message.components.length > 0) {
			const firstContainer = message.components[0] as any;
			if (firstContainer.components) {
				for (const component of firstContainer.components) {
					if (component.type === 10 && component.content && component.content.includes('**📝 Checked Content:**')) {
						// Extract content from code block
						const match = component.content.match(/``````/s);
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

	// Handle pagination button click
	public override async run(interaction: ButtonInteraction, data: PaginationMetadata) {
		// Verify button owner
		if (interaction.user.id !== data.ownerId) {
			return interaction.reply({
				content: 'Only the user who ran this command can use these controls.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Validate content was extracted
		if (!data.content) {
			return interaction.reply({
				content: 'Unable to extract the original content for pagination. Please run the command again.',
				flags: MessageFlags.Ephemeral
			});
		}

		try {
			// Re-run automod check with original content
			const result = this.container.automodRuleChecker.checkContent(data.content);

			// Get automod-check command instance
			const commandStore = this.container.stores.get('commands');
			const commandInstance = commandStore.get('automod-check') as any;

			if (!commandInstance) {
				throw new Error('AutomodCheckCommand not found in store');
			}

			// Regenerate components with new page number
			const components = await commandInstance.createResultComponents(data.content, result, data.ownerId, data.targetPage);

			// Update message with new page
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
