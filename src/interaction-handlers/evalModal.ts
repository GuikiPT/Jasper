// eval modal handler – executes user-submitted code and returns the result in a CV2 container
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { envParseArray } from '@skyra/env-utilities';
import {
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	type ModalSubmitInteraction
} from 'discord.js';
import { EVAL_CODE_FIELD_ID, EVAL_MODAL_ID_PREFIX, circularReplacer, sanitizeOutput, truncateOutput } from '../lib/evalConstants.js';

// ============================================================
// Types
// ============================================================

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type AsyncFunctionConstructor = new (...args: string[]) => AsyncFn;

/** Outcome of a single eval run. */
interface EvalResult {
	success: boolean;
	/** String-formatted output ready for display (already serialized + truncated). */
	output: string;
	/** Wall-clock execution time in milliseconds. */
	durationMs: number;
}

/** Parsed metadata encoded in the modal custom ID. */
interface EvalModalData {
	isEphemeral: boolean;
}

// ============================================================
// Handler
// ============================================================

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class EvalModalHandler extends InteractionHandler {
	// Matches any custom ID starting with the eval modal prefix.
	public override parse(interaction: ModalSubmitInteraction) {
		const [prefix, flag] = interaction.customId.split(':');
		if (prefix !== EVAL_MODAL_ID_PREFIX) return this.none();
		return this.some<EvalModalData>({ isEphemeral: flag !== '0' });
	}

	public override async run(interaction: ModalSubmitInteraction, data: EvalModalData) {
		// ── 1. Owner guard (second layer of defence) ──
		const owners: string[] = envParseArray('OWNERS');
		if (!owners.includes(interaction.user.id)) {
			return interaction.reply({
				content: 'Owner commands may only be used by the bot owner.',
				flags: MessageFlags.Ephemeral
			});
		}

		// ── 2. Capture code before deferring (fields are still accessible after defer) ──
		const rawCode = interaction.fields.getTextInputValue(EVAL_CODE_FIELD_ID);

		// ── 3. Defer so long-running code doesn't cause an "interaction failed" timeout ──
		try {
			await interaction.deferReply({ flags: data.isEphemeral ? MessageFlags.Ephemeral : undefined });
		} catch (error) {
			this.container.logger.error('[Eval] Failed to defer eval reply', error, { userId: interaction.user.id });
			return;
		}

		// ── 4. Run user code ──
		const evalResult = await this.execute(rawCode, interaction);

		// ── 5. Sanitize – strip the client token + all env secrets ──
		const clientToken = this.container.client.token ?? '';
		const sanitizedOutput = sanitizeOutput(evalResult.output, clientToken ? [clientToken] : []);
		const sanitizedCode = sanitizeOutput(rawCode, clientToken ? [clientToken] : []);

		// ── 6. Build Components v2 reply ──
		const components = this.buildResultContainer(evalResult.success, sanitizedCode, sanitizedOutput, evalResult.durationMs);

		try {
			return await interaction.editReply({ components, flags: ['IsComponentsV2'] });
		} catch (error) {
			this.container.logger.error('[Eval] Failed to send eval result', error, { userId: interaction.user.id });
			return undefined;
		}
	}

	// ============================================================
	// Private helpers
	// ============================================================

	/**
	 * Executes `code` inside an async function with `client`, `container`, and
	 * `interaction` in scope.  Always resolves – errors become part of the result.
	 */
	private async execute(code: string, interaction: ModalSubmitInteraction): Promise<EvalResult> {
		const start = Date.now();

		try {
			// Construct an async function from the submitted code string.
			// The Function constructor is intentional here – this is an eval command.
			// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
			const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor as AsyncFunctionConstructor;
			const fn = new AsyncFunction('client', 'container', 'interaction', code);

			const raw = await fn(this.container.client, this.container, interaction);

			const durationMs = Date.now() - start;
			const serialized = this.serialize(raw);

			return { success: true, output: truncateOutput(serialized), durationMs };
		} catch (error: unknown) {
			const durationMs = Date.now() - start;
			const serialized = this.serializeError(error);
			return { success: false, output: truncateOutput(serialized), durationMs };
		}
	}

	/** Serializes any value to a JSON-like string, handling circulars and special cases. */
	private serialize(value: unknown): string {
		if (value === undefined) return 'undefined';
		if (value === null) return 'null';

		try {
			return JSON.stringify(value, circularReplacer(), 2) ?? String(value);
		} catch {
			return String(value);
		}
	}

	/** Serializes a caught error to a readable JSON object string. */
	private serializeError(error: unknown): string {
		if (error instanceof Error) {
			const obj: Record<string, unknown> = {
				name: error.name,
				message: error.message
			};
			if (error.stack) obj.stack = error.stack;
			try {
				return JSON.stringify(obj, null, 2);
			} catch {
				return String(error);
			}
		}
		return this.serialize(error);
	}

	/** Assembles the Components v2 container displayed as the reply. */
	private buildResultContainer(success: boolean, code: string, output: string, durationMs: number): ContainerBuilder[] {
		const resultHeading = success ? '### ✅ Result' : '### ❌ Error';
		const footer = `-# Executed in ${durationMs}ms`;

		return [
			new ContainerBuilder()
				// ── Code section ──
				.addTextDisplayComponents(new TextDisplayBuilder().setContent('### 📥 Input'))
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`js\n${truncateOutput(code)}\n\`\`\``))
				// ── Result section ──
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(resultHeading))
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`json\n${output}\n\`\`\``))
				// ── Footer ──
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer))
		];
	}
}
