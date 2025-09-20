import { MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';
import type { CommandInteraction, Message } from 'discord.js';

/**
 * Discord component content limits
 */
const DISCORD_LIMITS = {
	TEXT_CONTENT_MAX_LENGTH: 40,
	CONTAINER_MAX_COMPONENTS: 25
};

const LIST_MAX_ITEMS = 12;
const MULTI_SECTION_MAX_ITEMS = 10;

/**
 * Truncates text to fit Discord's component limits
 */
function truncateText(text: string, maxLength: number = DISCORD_LIMITS.TEXT_CONTENT_MAX_LENGTH): string {
	if (text.length <= maxLength) {
		return text;
	}
	// For Discord mentions, just truncate without preserving the full mention
	if (text.includes('<@&') || text.includes('<#')) {
		return text.substring(0, maxLength - 3) + '...';
	}
	return text.substring(0, maxLength - 3) + '...';
}

/**
 * Truncates title text specifically (removes markdown formatting if needed)
 */
function truncateTitle(title: string): string {
	// Remove markdown headers first
	const cleanTitle = title.replace(/^#{1,6}\s*/, '');
	// Be very aggressive with title truncation to account for markdown
	return truncateText(cleanTitle, 25); // Leave room for markdown formatting (### + space = 4 chars)
}

/**
 * Creates a component-based reply with just text content
 */
export function createTextComponent(content: string) {
	return new ContainerBuilder()
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(truncateText(content))
		);
}

/**
 * Creates a component-based reply with longer text content for error messages
 */
export function createErrorTextComponent(content: string) {
	return new ContainerBuilder()
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(truncateText(content, 2000)) // Much longer limit for error messages
		);
}

/**
 * Creates a component-based reply for ephemeral messages
 */
export function replyEphemeralComponent(interaction: CommandInteraction, content: string) {
	const components = [createTextComponent(content)];

	return interaction.reply({
		components,
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
	});
}

/**
 * Creates a component-based reply for public messages
 */
export function replyWithComponent(interaction: CommandInteraction, content: string, ephemeral: boolean = false) {
	const components = [createTextComponent(content)];

	const flags = ephemeral
		? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
		: MessageFlags.IsComponentsV2;

	return interaction.reply({
		components,
		flags
	});
}

/**
 * Creates a component-based edit reply
 */
export function editReplyWithComponent(interaction: CommandInteraction, content: string) {
	const components = [createTextComponent(content)];

	return interaction.editReply({
		components,
		flags: MessageFlags.IsComponentsV2
	});
}

/**
 * Creates a component with a title and separated list items
 */
export function createListComponent(title: string, items: string[], emptyMessage: string = 'No items found.') {
	const container = new ContainerBuilder();

	// Truncate title and items to fit Discord limits
	const truncatedTitle = truncateTitle(title);
	const truncatedItems = (() => {
		if (items.length <= LIST_MAX_ITEMS) {
			return items.map((item) => truncateText(item));
		}
		const visible = items.slice(0, LIST_MAX_ITEMS - 1).map((item) => truncateText(item));
		const remaining = items.length - (LIST_MAX_ITEMS - 1);
		const moreLabel = truncateText(`…and ${remaining} more`, 35);
		return [...visible, moreLabel];
	})();

	// Add title
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`### ${truncatedTitle}`)
	);

	if (truncatedItems.length === 0) {
		// Add separator and empty message
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`*${truncateText(emptyMessage, 35)}*`) // Account for asterisks
		);
	} else {
		// Add separator after title
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);

		// Add each item with separators between them
		truncatedItems.forEach((item, index) => {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(item)
			);

			// Add separator between items (but not after the last one)
			if (index < truncatedItems.length - 1) {
				container.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
				);
			}
		});
	}

	return container;
}

/**
 * Creates a component with multiple sections (each with title and items)
 */
export function createMultiSectionComponent(
	sections: Array<{ title: string; items: string[]; emptyMessage?: string }>
): ContainerBuilder | null {
	const container = new ContainerBuilder();

	// Limit to 5 sections max to avoid hitting component limits
	const limitedSections = sections.slice(0, 5);

	let componentCount = 0;

	const addComponent = (builder: () => void) => {
		if (componentCount >= DISCORD_LIMITS.CONTAINER_MAX_COMPONENTS) {
			return false;
		}
		builder();
		componentCount += 1;
		return true;
	};

	for (let index = 0; index < limitedSections.length; index += 1) {
		const section = limitedSections[index];
		const truncatedTitle = truncateTitle(section.title);
		if (!addComponent(() =>
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${truncatedTitle}`)
			)
		)) {
			return null;
		}

		if (!addComponent(() =>
			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
			)
		)) {
			return null;
		}

		const truncatedItems = (() => {
			if (section.items.length === 0) {
				return [] as string[];
			}
			if (section.items.length <= MULTI_SECTION_MAX_ITEMS) {
				return section.items.map((item) => truncateText(item));
			}
			const visible = section.items
				.slice(0, MULTI_SECTION_MAX_ITEMS - 1)
				.map((item) => truncateText(item));
			const remaining = section.items.length - (MULTI_SECTION_MAX_ITEMS - 1);
			const moreLabel = truncateText(`…and ${remaining} more`, 35);
			return [...visible, moreLabel];
		})();

		if (truncatedItems.length === 0) {
			const emptyMsg = section.emptyMessage || 'No items found.';
			if (!addComponent(() =>
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`*${truncateText(emptyMsg, 35)}*`)
				)
			)) {
				return null;
			}
		} else {
			for (let itemIndex = 0; itemIndex < truncatedItems.length; itemIndex += 1) {
				const item = truncatedItems[itemIndex];
				if (!addComponent(() =>
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(item)
					)
				)) {
					return null;
				}
				const isLastItem = itemIndex === truncatedItems.length - 1;
				if (!isLastItem) {
					if (!addComponent(() =>
						container.addSeparatorComponents(
							new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
						)
					)) {
						return null;
					}
				}
			}
		}

		const isLastSection = index === limitedSections.length - 1;
		if (!isLastSection) {
			if (!addComponent(() =>
				container.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
				)
			)) {
				return null;
			}
		}
	}

	return container;
}

/**
 * Handles both interaction and message responses with components
 */
export async function respondWithComponent(
	context: {
		interaction?: CommandInteraction;
		message?: Message;
		ephemeral?: boolean;
		defer?: boolean;
	},
	component: ContainerBuilder
) {
	const components = [component];

	if (context.interaction) {
		if (context.defer) {
			await context.interaction.deferReply({
				flags: context.ephemeral ? MessageFlags.Ephemeral : undefined
			});
			return context.interaction.editReply({
				components,
				flags: MessageFlags.IsComponentsV2
			});
		} else {
			const flags = context.ephemeral
				? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
				: MessageFlags.IsComponentsV2;

			return context.interaction.reply({
				components,
				flags
			});
		}
	} else if (context.message) {
		// For message commands, we can't use components, so fall back to content
		// This is a limitation we'll need to handle
		const content = extractContentFromComponent(component);
		return context.message.reply(content);
	}

	throw new Error('No valid interaction or message provided');
}

/**
 * Fallback function to extract text content from component for message commands
 * This is a temporary solution since message commands don't support components
 */
function extractContentFromComponent(_component: ContainerBuilder): string {
	// This is a simplified extraction - in a real implementation you'd want to 
	// properly parse the component structure and convert it to readable text
	return "Component-based response (use slash commands for better formatting)";
}
