// evalConstants - modal/field IDs and sensitive-data scrubbing utilities for the eval command

/** Custom ID prefix for the eval modal. Ephemeral flag is appended: `eval-modal:1` / `eval-modal:0` */
export const EVAL_MODAL_ID_PREFIX = 'eval-modal';
export const EVAL_CODE_FIELD_ID = 'eval-code';

/** Maximum characters to display in the result code block before truncating. */
export const EVAL_OUTPUT_MAX_LENGTH = 2048;

/**
 * Builds a set of known-sensitive values from the process environment.
 * Any env key whose name matches common patterns (token, key, secret, etc.)
 * and whose value is at least 8 characters long is treated as sensitive.
 */
function gatherEnvSecrets(): string[] {
	const sensitiveKeyPattern = /token|key|secret|password|webhook|auth|credential|private|api_?url/i;
	const secrets: string[] = [];

	for (const [envKey, envValue] of Object.entries(process.env)) {
		if (envValue && envValue.length >= 8 && sensitiveKeyPattern.test(envKey)) {
			secrets.push(envValue);
		}
	}

	return secrets;
}

/**
 * Scrubs sensitive values (Discord token, env secrets) from a string.
 *
 * @param input             - The raw string to sanitize.
 * @param additionalSecrets - Extra secrets to redact (e.g. `client.token`).
 * @returns The sanitized string with every secret replaced by `[REDACTED]`.
 */
export function sanitizeOutput(input: string, additionalSecrets: string[] = []): string {
	const secrets = [...gatherEnvSecrets(), ...additionalSecrets].filter(Boolean);

	if (secrets.length === 0) return input;

	// Deduplicate and sort longest-first so partial overlaps are handled correctly.
	const uniqueSecrets = [...new Set(secrets)].sort((a, b) => b.length - a.length);

	let result = input;
	for (const secret of uniqueSecrets) {
		// String split/join avoids regex-escaping issues with special characters.
		result = result.split(secret).join('[REDACTED]');
	}

	return result;
}

/**
 * Truncates a string to `EVAL_OUTPUT_MAX_LENGTH` and appends a notice when
 * the output was cut.
 */
export function truncateOutput(output: string): string {
	if (output.length <= EVAL_OUTPUT_MAX_LENGTH) return output;
	return output.slice(0, EVAL_OUTPUT_MAX_LENGTH) + '\n\n… (output truncated)';
}

/**
 * A circular-reference-safe replacer for `JSON.stringify`.
 * Already-visited objects are replaced with the string `"[Circular]"`.
 */
export function circularReplacer(): (_key: string, value: unknown) => unknown {
	const seen = new WeakSet<object>();
	return (_key: string, value: unknown) => {
		if (typeof value === 'object' && value !== null) {
			if (seen.has(value)) return '[Circular]';
			seen.add(value);
		}
		return value;
	};
}
