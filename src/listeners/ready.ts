// ready module within listeners
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';
import { YouTubeService } from '../services/youtubeService';
import { ActivityType } from 'discord.js';

const dev = process.env.NODE_ENV !== 'production';

@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class UserEvent extends Listener {
	private readonly style = dev ? yellow : blue;

	public override run() {
		try {
			this.printBanner();
			this.printStoreDebugInformation();
			this.startYouTubeManager();
			this.startSupportThreadMonitor();
			this.startReminderService();
			this.setBotActivity();
		} catch (error) {
			this.container.logger.error('Unhandled error during ready listener run', error);
		}
	}

	private printBanner() {
		const success = green('+');

		const llc = dev ? magentaBright : white;
		const blc = dev ? magenta : blue;

		const line01 = llc('');
		const line02 = llc('');
		const line03 = llc('');

		// Offset Pad
		const pad = ' '.repeat(7);

		console.log(
			String.raw`
${line01} ${pad}${blc('1.0.0')}
${line02} ${pad}[${success}] Gateway
${line03}${dev ? ` ${pad}${blc('<')}${llc('/')}${blc('>')} ${llc('DEVELOPMENT MODE')}` : ''}
		`.trim()
		);
	}

	private setBotActivity() {
		try {
			const { client } = this.container;
			client.user?.setActivity('👀 Support Threads', { type: ActivityType.Watching });
			client.user?.setStatus('idle');
		} catch (error) {
			this.container.logger.error('Failed to set bot activity and status', error);
		}
	}

	private printStoreDebugInformation() {
		const { client, logger } = this.container;
		const stores = [...client.stores.values()];
		const last = stores.pop()!;

		for (const store of stores) logger.info(this.styleStore(store, false));
		logger.info(this.styleStore(last, true));
	}

	private styleStore(store: StoreRegistryValue, last: boolean) {
		return gray(`${last ? '└─' : '├─'} Loaded ${this.style(store.size.toString().padEnd(3, ' '))} ${store.name}.`);
	}

	private async startYouTubeManager() {
		try {
			const youtubeService = YouTubeService.getInstance();
			await youtubeService.start();
		} catch (error) {
			this.container.logger.error('Failed to start YouTube service:', error);
		}
	}

	private async startSupportThreadMonitor() {
		try {
			this.container.supportThreadMonitor.start();
		} catch (error) {
			this.container.logger.error('Failed to start SupportThreadMonitor:', error);
		}
	}

	private async startReminderService() {
		try {
			this.container.reminderService.start();
		} catch (error) {
			this.container.logger.error('Failed to start ReminderService:', error);
		}
	}
}
