// Cache service for temporary data storage
import { randomBytes } from 'crypto';

interface PurgedMessagesData {
	purgedTime: string;
	channelName: string;
	messages: Array<{
		timestamp: string;
		messageId: string;
		username: string;
		discriminator: string;
		userId: string | null;
		content: string;
		isReply: boolean;
		avatarUrl?: string;
	}>;
}

interface CachedItem<T> {
	data: T;
	expiresAt: number;
}

export class PurgedMessagesCache {
	private cache = new Map<string, CachedItem<PurgedMessagesData>>();
	private readonly defaultTTL = 3600000; // 1 hour

	constructor() {
		// Clean up expired entries every 5 minutes
		setInterval(() => this.cleanup(), 300000);
	}

	public set(data: PurgedMessagesData, ttl: number = this.defaultTTL): string {
		const id = randomBytes(16).toString('hex');
		this.cache.set(id, {
			data,
			expiresAt: Date.now() + ttl
		});
		return id;
	}

	public get(id: string): PurgedMessagesData | null {
		const item = this.cache.get(id);
		if (!item) return null;

		if (Date.now() > item.expiresAt) {
			this.cache.delete(id);
			return null;
		}

		return item.data;
	}

	public delete(id: string): boolean {
		return this.cache.delete(id);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [id, item] of this.cache.entries()) {
			if (now > item.expiresAt) {
				this.cache.delete(id);
			}
		}
	}

	public getStats(): { total: number; expired: number } {
		const now = Date.now();
		let expired = 0;
		for (const item of this.cache.values()) {
			if (now > item.expiresAt) expired++;
		}
		return {
			total: this.cache.size,
			expired
		};
	}
}

// ============================================================
// Type Declarations
// ============================================================

declare module '@sapphire/pieces' {
	interface Container {
		purgedMessagesCache: PurgedMessagesCache;
	}
}
