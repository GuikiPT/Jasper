// Tag autocomplete handler - provides tag name suggestions for delete, edit, and use subcommands
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction } from 'discord.js';

import { ensureAllowedTagRoleAccess, ensureSupportRoleAccess, ensureTagChannelAccess, normalizeTagName } from '../subcommands/support/tag/utils';

// Subcommands that require tag name autocomplete
const HANDLED_SUBCOMMANDS = new Set(['delete', 'edit', 'use']);

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Autocomplete
})
export class SupportTagsAutocompleteHandler extends InteractionHandler {
	// Send autocomplete choices to Discord
	public override async run(interaction: AutocompleteInteraction, choices: ApplicationCommandOptionChoiceData[]) {
		try {
			return interaction.respond(choices);
		} catch (error) {
			this.container.logger.error('Failed to respond to support tag autocomplete interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id
			});
		}
		return interaction.respond([]);
	}

	// Parse interaction and generate tag name suggestions
	public override async parse(interaction: AutocompleteInteraction) {
		try {
			// Require guild context
			if (!interaction.guildId) {
				return this.some([]);
			}

			// Check if this is a handled subcommand
			const subcommand = interaction.options.getSubcommand(false);
			if (!subcommand || !HANDLED_SUBCOMMANDS.has(subcommand)) {
				return this.none();
			}

			// Check if the focused option is the tag name field
			const focused = interaction.options.getFocused(true);
			if (focused.name !== 'name') {
				return this.none();
			}

			// Verify user has support role access
			const supportAccess = await ensureSupportRoleAccess(this, interaction);
			if (!supportAccess.allowed) {
				return this.some([]);
			}

			// For "use" subcommand, verify tag role access
			if (subcommand === 'use') {
				const allowedTagRoleAccess = await ensureAllowedTagRoleAccess(this, interaction);
				if (!allowedTagRoleAccess.allowed) {
					return this.some([]);
				}
			}

			// Verify channel access restrictions
			const channelAccess = await ensureTagChannelAccess(this, interaction);
			if (!channelAccess.allowed) {
				return this.some([]);
			}

			// Extract and normalize search query
			const rawQuery = typeof focused.value === 'string' ? focused.value : '';
			const query = rawQuery.trim();
			const normalizedQuery = query ? normalizeTagName(query) : '';

			// Get support tag service
			const service = this.container.supportTagService;
			if (!service) {
				this.container.logger.error('Support tag service is not initialised');
				return this.some([]);
			}

			try {
				// Fetch all tags for guild
				const tags = await service.listTags(interaction.guildId);

				// Sort tags by relevance: startsWith > contains
				const startsWith: string[] = [];
				const contains: string[] = [];

				for (const { name } of tags) {
					// If no query, include all tags
					if (!normalizedQuery) {
						contains.push(name);
						continue;
					}

					// Prioritize exact prefix matches
					if (name.startsWith(normalizedQuery)) {
						startsWith.push(name);
					} else if (name.includes(normalizedQuery)) {
						contains.push(name);
					}
				}

				// Build choices list (max 25 for Discord limit)
				const choices = [...startsWith, ...contains]
					.slice(0, 25)
					.map((name) => ({ name, value: name }) satisfies ApplicationCommandOptionChoiceData);

				return this.some(choices);
			} catch (error) {
				this.container.logger.error('Failed to resolve support tag autocomplete suggestions', error);
				return this.some([]);
			}
		}
		catch (error) {
			this.container.logger.error('Failed to parse support tag autocomplete interaction', error, {
				guildId: interaction.guildId ?? 'dm',
				userId: interaction.user.id
			});
			return this.none();
		}
	}
}
