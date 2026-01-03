// chatInputCommandSuccess module within listeners/commands/chatInputCommands
import { Events, Listener, LogLevel, type ChatInputCommandAcceptedPayload } from '@sapphire/framework';
import type { Logger } from '@sapphire/plugin-logger';
import { logSuccessCommand } from '../../../lib/utils';

export class UserListener extends Listener<typeof Events.ChatInputCommandAccepted> {
	public override run(payload: ChatInputCommandAcceptedPayload) {
		logSuccessCommand(payload, 'accepted');
	}

	public override onLoad() {
		this.enabled = (this.container.logger as Logger).level <= LogLevel.Debug;
		return super.onLoad();
	}
}
