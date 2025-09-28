// index.get module within routes
import { Route } from '@sapphire/plugin-api';

export class UserRoute extends Route {
	public override run(_request: Route.Request, response: Route.Response) {
		try {
			response.json({ message: 'Landing Page!' });
		} catch (error) {
			this.container.logger.error('[GET /] Handler failed', error);
			try {
				// Prefer status() when available
				(response as any).status?.(500);
			} catch { }
			// Fallback
			(response as any).statusCode = 500;
			response.json({ error: 'Internal Server Error' });
		}
	}
}
