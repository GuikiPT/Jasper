import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
	SUPPORT_TAG_LIST_CUSTOM_ID,
	SUPPORT_TAG_LIST_ITEMS_PER_PAGE
} from '../subcommands/support/tag/constants';
import {
	SUPPORT_TAG_TABLE_MISSING_MESSAGE,
	isSupportTagPrismaTableMissingError,
	isSupportTagTableMissingError
} from '../subcommands/support/tag/utils';

interface PaginationMetadata {
	ownerId: string;
	targetPage: number;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class SupportTagListPaginationHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const segments = interaction.customId.split(':');
		if (segments.length !== 4) {
			return this.none();
		}

		const [base, ownerId, action, rawPage] = segments;
		if (base !== SUPPORT_TAG_LIST_CUSTOM_ID) {
			return this.none();
		}

		if (!ownerId || (action !== 'prev' && action !== 'next')) {
			return this.none();
		}

		const targetPage = Number.parseInt(rawPage, 10);
		if (!Number.isFinite(targetPage)) {
			return this.none();
		}

		return this.some<PaginationMetadata>({ ownerId, targetPage: Math.max(1, targetPage) });
	}

	public override async run(interaction: ButtonInteraction, data: PaginationMetadata) {
		if (interaction.user.id !== data.ownerId) {
			return interaction.reply({
				content: 'Only the user who ran this command can use these controls.',
				flags: MessageFlags.Ephemeral
			});
		}

		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({
				content: 'This component can only be used inside a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		let tags;
		try {
			tags = await this.container.database.guildSupportTag.findMany({
				where: { guildId },
				orderBy: { name: 'asc' }
			});
		} catch (error) {
			if (isSupportTagTableMissingError(error) || isSupportTagPrismaTableMissingError(error)) {
				return interaction.reply({ content: SUPPORT_TAG_TABLE_MISSING_MESSAGE, flags: MessageFlags.Ephemeral });
			}
			throw error;
		}

		const tagNames = tags.map((tag) => tag.name);
		const requestedPage = data.targetPage;

		const {
			createPaginatedComponentWithButtons,
			createPaginationButtons
		} = await import('../lib/components.js');

		const { component, totalPages, currentPage } = createPaginatedComponentWithButtons(
			'Support Tags',
			tagNames,
			'No support tags have been created yet.',
			SUPPORT_TAG_LIST_ITEMS_PER_PAGE,
			requestedPage
		);

		const buttons = createPaginationButtons(currentPage, totalPages, SUPPORT_TAG_LIST_CUSTOM_ID, {
			ownerId: data.ownerId
		});
		const components = buttons.length > 0 ? [component, ...buttons] : [component];

		return interaction.update({ components });
	}
}
