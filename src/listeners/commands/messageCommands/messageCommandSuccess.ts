// messageCommandSuccess module within listeners/commands/messageCommands
import type { MessageCommandSuccessPayload } from '@sapphire/framework';
import { Listener, LogLevel } from '@sapphire/framework';
import type { Logger } from '@sapphire/plugin-logger';
import { logSuccessCommand } from '../../../lib/utils';

export class UserEvent extends Listener {
	public override run(payload: MessageCommandSuccessPayload) {
		logSuccessCommand(payload, 'success');
	}

	public override onLoad() {
		this.enabled = (this.container.logger as Logger).level <= LogLevel.Debug;
		return super.onLoad();
	}
}
