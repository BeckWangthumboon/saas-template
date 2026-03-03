import { httpRouter } from 'convex/server';

import { polarWebhook } from './billing/webhooks';
import { resendWebhook } from './emails/webhooks';
import { authKit } from './users/auth';

const http = httpRouter();
authKit.registerRoutes(http);
http.route({
  path: '/billing/polar/events',
  method: 'POST',
  handler: polarWebhook,
});
http.route({
  path: '/emails/resend/events',
  method: 'POST',
  handler: resendWebhook,
});
export default http;
