import { MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import type { CommandInteraction, Message } from 'discord.js';

/**
 * Discord component content limits
 */
const DISCORD_LIMITS = {
	TEXT_CONTENT_MAX_LENGTH: 2000, // Increased from 40 to 2000
	CONTAINER_MAX_COMPONENTS: 25
};

/**
 * Truncates text to fit Discord's component limits
 */
function truncateText(text: string, maxLength: number = DISCORD_LIMITS.TEXT_CONTENT_MAX_LENGTH): string {
	if (text.length <= maxLength) {
		return text;
	}
	// More conservative truncation for long text
	return text.substring(0, maxLength - 3) + '...';
}

/**
 * Truncates title text specifically (removes markdown formatting if needed)
 */
function truncateTitle(title: string): string {
	// Remove markdown headers first
	const cleanTitle = title.replace(/^#{1,6}\s*/, '');
	// Less aggressive title truncation
	return truncateText(cleanTitle, 100); // Increased from 25 to 100
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
	const components = [createErrorTextComponent(content)]; // Use error text component for longer content

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
	const components = [createErrorTextComponent(content)]; // Use error text component for longer content

	return interaction.editReply({
		components,
		flags: MessageFlags.IsComponentsV2
	});
}

/**
 * Creates a component with a title and list items (auto-detects separator based on content length)
 */
export function createListComponent(title: string, items: string[], emptyMessage: string = 'No items found.', forceNewlines: boolean = false) {
	const container = new ContainerBuilder();

	// Truncate title to fit Discord limits
	const truncatedTitle = truncateTitle(title);

	// Add title
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`### ${truncatedTitle}`)
	);

	// Add separator after title
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
	);

	if (items.length === 0) {
		// Add empty message
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`*${truncateText(emptyMessage, 1900)}*`)
		);
	} else {
		// Determine separator based on content length or force
		const averageItemLength = items.reduce((sum, item) => sum + item.length, 0) / items.length;
		const useNewlines = forceNewlines || averageItemLength > 50; // If average item is long, use newlines

		const separator = useNewlines ? '\n' : ', ';

		// Smart pagination: Try to fit as many items as possible within the limit
		let fittingItems: string[] = [];
		let currentLength = 0;
		const maxLength = 1900;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const itemWithSeparator = i === 0 ? item : separator + item;
			const projectedLength = currentLength + itemWithSeparator.length;

			// Check if adding this item would exceed the limit
			if (projectedLength > maxLength) {
				// If we haven't added any items yet, we need to truncate this single item
				if (fittingItems.length === 0) {
					const truncatedItem = truncateText(item, maxLength - 3);
					fittingItems.push(truncatedItem);
					break;
				}
				// Otherwise, stop here and add pagination info
				break;
			}

			fittingItems.push(item);
			currentLength = projectedLength;
		}

		// Add pagination info if we couldn't fit everything
		if (fittingItems.length < items.length) {
			const remaining = items.length - fittingItems.length;
			const moreText = `${separator}...and ${remaining} more`;

			// Check if we can fit the "more" text
			if (currentLength + moreText.length <= maxLength) {
				const finalContent = fittingItems.join(separator) + moreText;
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(finalContent)
				);
			} else {
				// If we can't fit the "more" text, remove the last item and try again
				if (fittingItems.length > 1) {
					fittingItems.pop(); // Remove last item to make room
					const remainingNow = items.length - fittingItems.length;
					const newMoreText = `${separator}...and ${remainingNow} more`;
					const contentWithoutLast = fittingItems.join(separator) + newMoreText;

					if (contentWithoutLast.length <= maxLength) {
						container.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(contentWithoutLast)
						);
					} else {
						// Fallback: just show what we can fit
						container.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(fittingItems.join(separator))
						);
					}
				} else {
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(fittingItems.join(separator))
					);
				}
			}
		} else {
			// All items fit, show them all
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(fittingItems.join(separator))
			);
		}
	}

	return container;
}

/**
 * Creates a component with multiple sections (each with title and items)
 */
export function createMultiSectionComponent(
	sections: Array<{ title: string; items: string[]; emptyMessage?: string; forceNewlines?: boolean }>
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

		// Don't truncate individual items aggressively, let the join handle the overall length
		const truncatedItems = section.items;

		if (truncatedItems.length === 0) {
			const emptyMsg = section.emptyMessage || 'No items found.';
			if (!addComponent(() =>
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`*${truncateText(emptyMsg, 1900)}*`)
				)
			)) {
				return null;
			}
		} else {
			// Determine separator based on content length or force
			const averageItemLength = truncatedItems.reduce((sum, item) => sum + item.length, 0) / truncatedItems.length;
			const useNewlines = section.forceNewlines || averageItemLength > 50;

			const separator = useNewlines ? '\n' : ', ';
			const joinedItems = truncatedItems.join(separator);
			const truncatedContent = truncateText(joinedItems, 1900);

			if (!addComponent(() =>
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(truncatedContent)
				)
			)) {
				return null;
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
 * Creates a paginated component with navigation buttons for large lists
 */
export function createPaginatedComponentWithButtons(
	title: string,
	items: string[],
	emptyMessage: string = 'No items found.',
	itemsPerPage: number = 10,
	currentPage: number = 1
) {
	const container = new ContainerBuilder();

	// Truncate title to fit Discord limits
	const truncatedTitle = truncateTitle(title);

	if (items.length === 0) {
		// Add title
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### ${truncatedTitle}`)
		);

		// Add separator after title
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);

		// Add empty message
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`*${truncateText(emptyMessage, 1900)}*`)
		);

		return { component: container, totalPages: 0, currentPage: 1 };
	}

	// Calculate pagination
	const totalPages = Math.ceil(items.length / itemsPerPage);
	const validPage = Math.max(1, Math.min(currentPage, totalPages));

	// Get items for current page
	const startIndex = (validPage - 1) * itemsPerPage;
	const endIndex = Math.min(startIndex + itemsPerPage, items.length);
	const pageItems = items.slice(startIndex, endIndex);

	// Add title with page info
	const titleWithPage = totalPages > 1 ? `${truncatedTitle} (Page ${validPage}/${totalPages})` : truncatedTitle;
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`### ${titleWithPage}`)
	);

	// Add separator after title
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
	);

	// Add page items with numbered format
	const numberedItems = pageItems.map((item, index) => {
		const itemNumber = startIndex + index + 1;
		return `${itemNumber}. ${item}`;
	});

	const content = numberedItems.join('\n');
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(truncateText(content, 1900))
	);

	// Add pagination info if multiple pages
	if (totalPages > 1) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);

		const paginationInfo = `Showing ${pageItems.length} of ${items.length} items`;
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`*${paginationInfo}*`)
		);
	}

	return { component: container, totalPages, currentPage: validPage };
}

/**
 * Creates navigation buttons for pagination
 */
export function createPaginationButtons(
	currentPage: number,
	totalPages: number,
	customId: string,
	options: { ownerId?: string } = {}
) {
	if (totalPages <= 1) return [];

	const buttons = [];
	const ownerSegment = options.ownerId ? `:${options.ownerId}` : '';
	const buildId = (action: 'prev' | 'next' | 'page', page: number) => `${customId}${ownerSegment}:${action}:${page}`;

	const previousPage = Math.max(1, currentPage - 1);
	const nextPage = Math.min(totalPages, currentPage + 1);

	// Previous button
	buttons.push(
		new ButtonBuilder()
			.setCustomId(buildId('prev', previousPage))
			.setLabel('Previous')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(currentPage <= 1)
	);

	// Page indicator (disabled, but keep consistent custom id format)
	buttons.push(
		new ButtonBuilder()
			.setCustomId(buildId('page', currentPage))
			.setLabel(`${currentPage}/${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true)
	);

	// Next button
	buttons.push(
		new ButtonBuilder()
			.setCustomId(buildId('next', nextPage))
			.setLabel('Next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(currentPage >= totalPages)
	);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)];
}

/**
 * Creates a paginated component with multiple pages for large lists
 */
export function createPaginatedListComponent(
	title: string,
	items: string[],
	emptyMessage: string = 'No items found.',
	itemsPerPage: number = 10
) {
	const container = new ContainerBuilder();

	// Truncate title to fit Discord limits
	const truncatedTitle = truncateTitle(title);

	if (items.length === 0) {
		// Add title
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### ${truncatedTitle}`)
		);

		// Add separator after title
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);

		// Add empty message
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`*${truncateText(emptyMessage, 1900)}*`)
		);

		return container;
	}

	// Calculate pagination
	const totalPages = Math.ceil(items.length / itemsPerPage);
	const currentPage = 1; // For now, always show first page (can be enhanced later)

	// Get items for current page
	const startIndex = (currentPage - 1) * itemsPerPage;
	const endIndex = Math.min(startIndex + itemsPerPage, items.length);
	const pageItems = items.slice(startIndex, endIndex);

	// Add title with page info
	const titleWithPage = totalPages > 1 ? `${truncatedTitle} (Page ${currentPage}/${totalPages})` : truncatedTitle;
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`### ${titleWithPage}`)
	);

	// Add separator after title
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
	);

	// Add page items with numbered format
	const numberedItems = pageItems.map((item, index) => {
		const itemNumber = startIndex + index + 1;
		return `${itemNumber}. ${item}`;
	});

	const content = numberedItems.join('\n');
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(truncateText(content, 1900))
	);

	// Add pagination info if multiple pages
	if (totalPages > 1) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
		);

		const paginationInfo = `Showing ${pageItems.length} of ${items.length} items`;
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`*${paginationInfo}*`)
		);
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
