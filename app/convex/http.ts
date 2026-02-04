import { httpRouter } from 'convex/server';

import { polarWebhook } from './billing/webhooks';
import { authKit } from './users/auth';

const http = httpRouter();
authKit.registerRoutes(http);
http.route({
  path: '/billing/polar/events',
  method: 'POST',
  handler: polarWebhook,
});
export default http;
