// Reminder utilities - Helper functions for reminder management

/**
 * Generates a short, unique identifier (5 characters)
 * Uses alphanumeric characters (excluding similar looking ones: 0, O, I, l)
 */
export function generateShortUuid(): string {
	const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
	let result = '';
	for (let i = 0; i < 5; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

/**
 * Truncates a message to a specified length
 */
export function truncateMessage(message: string, maxLength: number = 40): string {
	if (message.length <= maxLength) {
		return message;
	}
	return message.substring(0, maxLength - 3) + '...';
}

/**
 * Formats a reminder for autocomplete display
 */
export function formatReminderForAutocomplete(uuid: string, message: string): string {
	return `${uuid} - ${truncateMessage(message, 40)}`;
}
