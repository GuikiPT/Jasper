// Tag list pagination handler - handles page navigation for tag list display
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { SUPPORT_TAG_LIST_CUSTOM_ID, SUPPORT_TAG_LIST_ITEMS_PER_PAGE } from '../subcommands/support/tag/constants';
import {
    SUPPORT_TAG_TABLE_MISSING_MESSAGE,
    isSupportTagPrismaTableMissingError,
    isSupportTagTableMissingError
} from '../subcommands/support/tag/utils';

// Parsed pagination metadata from button custom ID
interface PaginationMetadata {
    ownerId: string;
    targetPage: number;
}

@ApplyOptions<InteractionHandler.Options>({
    interactionHandlerType: InteractionHandlerTypes.Button
})
export class SupportTagListPaginationHandler extends InteractionHandler {
    // Parse button custom ID and extract pagination metadata
    public override parse(interaction: ButtonInteraction) {
        // Expected format: customId:ownerId:action:page
        const segments = interaction.customId.split(':');
        if (segments.length !== 4) {
            return this.none();
        }

        const [base, ownerId, action, rawPage] = segments;
        
        // Validate custom ID prefix
        if (base !== SUPPORT_TAG_LIST_CUSTOM_ID) {
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

        return this.some<PaginationMetadata>({ ownerId, targetPage: Math.max(1, targetPage) });
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

        // Validate guild context
        const guildId = interaction.guildId;
        if (!guildId) {
            return interaction.reply({
                content: 'This component can only be used inside a server.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get support tag service
        const service = this.container.supportTagService;
        if (!service) {
            this.container.logger.error('Support tag service is not initialised');
            return interaction.reply({
                content: 'Support tags are not available right now. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Fetch all tags for guild
        let tags;
        try {
            tags = await service.listTags(guildId);
        } catch (error) {
            if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
                return interaction.reply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE, flags: MessageFlags.Ephemeral });
            }
            throw error;
        }

        // Extract tag names for display
        const tagNames = tags.map((tag) => tag.name);
        const requestedPage = data.targetPage;

        // Import components dynamically to avoid circular dependencies
        const { createPaginatedComponentWithButtons, createPaginationButtons } = await import('../lib/components.js');

        // Create paginated list with new page number
        const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
            'Support Tags',
            tagNames,
            'No support tags have been created yet.',
            SUPPORT_TAG_LIST_ITEMS_PER_PAGE,
            requestedPage
        );

        // Create navigation buttons for new page
        const buttons = createPaginationButtons(currentPage, totalPages, SUPPORT_TAG_LIST_CUSTOM_ID, {
            ownerId: data.ownerId
        });
        const components = buttons.length > 0 ? [component, ...buttons] : [component];

        // Update message with new page
        return interaction.update({ components });
    }
}
