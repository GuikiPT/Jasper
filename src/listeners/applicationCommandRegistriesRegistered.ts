import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { YouTubeService } from '../services/youtubeService';

@ApplyOptions<Listener.Options>({ event: Events.ApplicationCommandRegistriesRegistered, once: true })
export class UserEvent extends Listener<typeof Events.ApplicationCommandRegistriesRegistered> {
	public override async run() {
		try {
			this.container.logger.info('Application commands synchronized; starting background services');
			await this.startYouTubeManager();
			this.startSupportThreadMonitor();
			this.startReminderService();
		} catch (error) {
			this.container.logger.error('Unhandled error during post-command-sync startup', error);
		}
	}

	private async startYouTubeManager() {
		try {
			const youtubeService = YouTubeService.getInstance();
			await youtubeService.start();
		} catch (error) {
			this.container.logger.error('Failed to start YouTube service:', error);
		}
	}

	private startSupportThreadMonitor() {
		try {
			this.container.supportThreadMonitor.start();
		} catch (error) {
			this.container.logger.error('Failed to start SupportThreadMonitor:', error);
		}
	}

	private startReminderService() {
		try {
			this.container.reminderService.start();
		} catch (error) {
			this.container.logger.error('Failed to start ReminderService:', error);
		}
	}
}