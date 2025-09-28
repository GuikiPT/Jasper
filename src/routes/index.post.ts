// index.post module within routes
import { Route } from '@sapphire/plugin-api';

export class UserRoute extends Route {
	public override run(_request: Route.Request, response: Route.Response) {
		try {
			response.json({ message: 'Landing Page!' });
		} catch (error) {
			this.container.logger.error('[POST /] Handler failed', error);
			try {
				(response as any).status?.(500);
			} catch { }
			(response as any).statusCode = 500;
			response.json({ error: 'Internal Server Error' });
		}
	}
}
