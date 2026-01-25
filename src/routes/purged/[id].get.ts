import { Route } from '@sapphire/plugin-api';
import { parseDiscordMarkdown } from '../../lib/discordMarkdown.js';

export class UserRoute extends Route {
	public override run(request: Route.Request, response: Route.Response) {
		try {
			// Extract ID from URL path  /purged/:id
			const url = new URL(request.url || '', `http://${request.headers.host}`);
			const pathParts = url.pathname.split('/');
			const cacheId = pathParts[pathParts.length - 1];

			if (!cacheId) {
				this.sendErrorPage(response, 'No Data', 'No purged messages ID was provided.');
				return;
			}

			// Get data from cache
			const data = this.container.purgedMessagesCache.get(cacheId);

			if (!data) {
				this.sendErrorPage(
					response,
					'Link Expired',
					'This purged messages link has expired or is invalid. Links are valid for 5 minutes.'
				);
				return;
			}

			// Generate message HTML
			const messagesHtml = data.messages
				.map((msg) => {
					// Use fetched avatar URL if available, otherwise calculate default avatar
					let avatar: string;
					if (msg.avatarUrl) {
						avatar = msg.avatarUrl;
					} else if (msg.userId) {
						try {
							const userId = BigInt(msg.userId);
							const defaultAvatarIndex = Number((userId >> 22n) % 6n);
							avatar = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
						} catch {
							avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
						}
					} else {
						avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
					}

					const replySlot = msg.isReply
						? `<discord-reply slot="reply" author="${this.escapeHtml(msg.username)}">Previous message</discord-reply>`
						: '';

					// Parse markdown in message content
					const parsedContent = parseDiscordMarkdown(msg.content);

					return `
					<discord-message
						author="${this.escapeHtml(msg.username)}"
						avatar="${avatar}"
						timestamp="${msg.timestamp}"
					>
						${replySlot}
						<span>${parsedContent}</span>
					</discord-message>`;
				})
				.join('\n');

			const html = `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0" />
	<meta name="description" content="Purged Messages Archive - Discord Components" />
	<title>Purged Messages - ${this.escapeHtml(data.channelName)}</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}
		
		html, body {
			height: 100%;
			overflow-x: hidden;
		}
		
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			background: #36393f;
			color: #dcddde;
			padding: 20px;
		}
		
		.container {
			max-width: 1200px;
			margin: 0 auto;
			width: 100%;
		}
		
		.header {
			background: #2f3136;
			padding: 20px;
			border-radius: 8px;
			margin-bottom: 20px;
			border-left: 4px solid #ed4245;
		}
		
		.header h1 {
			color: #ed4245;
			margin: 0 0 10px 0;
			font-size: 24px;
		}
		
		.header p {
			margin: 5px 0;
			color: #b9bbbe;
		}
		
		.info {
			display: flex;
			gap: 20px;
			flex-wrap: wrap;
			margin-top: 10px;
		}
		
		.info-item {
			background: #40444b;
			padding: 8px 12px;
			border-radius: 4px;
			font-size: 14px;
		}
		
		.info-label {
			color: #8e9297;
			font-size: 12px;
			text-transform: uppercase;
			font-weight: 600;
			margin-bottom: 2px;
		}
		
		.info-value {
			color: #ffffff;
		}
		
		.messages-container {
			background: #2f3136;
			padding: 20px;
			border-radius: 8px;
		}
		
		footer {
			margin-top: 40px;
			padding: 20px 0;
			border-top: 1px solid #4f545c;
			text-align: center;
			color: #8e9297;
			font-size: 14px;
		}
		
		.link {
			color: #00b0f4;
			text-decoration: none;
		}
		
		.link:hover {
			text-decoration: underline;
		}

		/* Discord markdown styles */
		discord-messages {
			background-color: #36393f !important;
			border-radius: 8px;
			min-height: 500px;
			padding: 16px;
		}

		discord-message {
			background-color: transparent !important;
		}

		discord-message code {
			background-color: #2f3136;
			padding: 2px 4px;
			border-radius: 3px;
			font-family: 'Consolas', 'Courier New', monospace;
			font-size: 0.875em;
			color: #dcddde;
		}

		discord-message pre {
			background-color: #2f3136;
			padding: 8px;
			border-radius: 4px;
			overflow-x: auto;
			margin: 4px 0;
			border: 1px solid #202225;
		}

		discord-message pre code {
			background-color: transparent;
			padding: 0;
			font-size: 0.875em;
		}

		discord-message blockquote {
			border-left: 4px solid #4f545c;
			padding-left: 12px;
			margin: 4px 0;
			color: #dcddde;
		}

		discord-message strong {
			font-weight: 700;
			color: #ffffff;
		}

		discord-message em {
			font-style: italic;
		}

		discord-message u {
			text-decoration: underline;
		}

		discord-message s {
			text-decoration: line-through;
		}

		discord-message .spoiler {
			background-color: #202225;
			color: transparent;
			border-radius: 3px;
			padding: 0 2px;
			cursor: pointer;
			transition: all 0.1s;
			user-select: none;
		}

		discord-message .spoiler:hover,
		discord-message .spoiler:active {
			background-color: rgba(32, 34, 37, 0.6);
			color: #dcddde;
		}

		discord-message a {
			color: #00aff4;
			text-decoration: none;
		}

		discord-message a:hover {
			text-decoration: underline;
		}

		discord-message ul {
			list-style-type: disc;
			color: #dcddde;
			margin: 4px 0;
			padding-left: 20px;
		}

		discord-message ol {
			list-style-type: decimal;
			color: #dcddde;
			margin: 4px 0;
			padding-left: 20px;
		}

		discord-message li {
			color: #dcddde;
		}

		discord-message .discord-custom-emoji {
			vertical-align: bottom;
			display: inline-block;
		}
	</style>
	<script type="importmap">
	{
		"imports": {
			"@skyra/discord-components-core": "https://esm.sh/@skyra/discord-components-core@4.0.2",
			"lit": "https://esm.sh/lit@3",
			"lit/": "https://esm.sh/lit@3/"
		}
	}
	</script>
	<script type="module">
		import '@skyra/discord-components-core';
	</script>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>🗑️ Purged Messages Archive</h1>
			<p>Messages deleted from ${this.escapeHtml(data.channelName)}</p>
			<div class="info">
				<div class="info-item">
					<div class="info-label">Purged At</div>
					<div class="info-value">${this.escapeHtml(data.purgedTime)}</div>
				</div>
				<div class="info-item">
					<div class="info-label">Channel</div>
					<div class="info-value">${this.escapeHtml(data.channelName)}</div>
				</div>
				<div class="info-item">
					<div class="info-label">Messages</div>
					<div class="info-value">${data.messages.length}</div>
				</div>
			</div>
		</div>

		<div class="messages-container">
			<discord-messages>
				${messagesHtml}
			</discord-messages>
		</div>
	</div>
</body>
</html>`;

			response.setHeader('Content-Type', 'text/html; charset=utf-8');
			response.end(html);
		} catch (error) {
			this.container.logger.error('[GET /purged/:id] Handler failed', error);
			try {
				(response as any).status?.(500);
			} catch { }
			(response as any).statusCode = 500;
			response.json({ error: 'Internal Server Error' });
		}
	}

	private sendErrorPage(response: Route.Response, title: string, message: string): void {
		response.setHeader('Content-Type', 'text/html; charset=utf-8');
		response.end(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Error - Purged Messages</title>
				<style>
					body {
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
						background: #36393f;
						color: #dcddde;
						padding: 40px;
						text-align: center;
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
						min-height: 100vh;
						margin: 0;
					}
					h1 {
						color: #ed4245;
						font-size: 48px;
						margin-bottom: 20px;
					}
					p {
						font-size: 18px;
						max-width: 500px;
					}
				</style>
			</head>
			<body>
				<h1>❌ ${this.escapeHtml(title)}</h1>
				<p>${this.escapeHtml(message)}</p>
			</body>
			</html>
		`);
	}

	private escapeHtml(text: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, (m) => map[m]);
	}
}
