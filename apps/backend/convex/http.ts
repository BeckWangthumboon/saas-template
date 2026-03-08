import { httpRouter } from 'convex/server';

import { resendWebhook } from './emails/webhooks';
import { authKit } from './users/auth';

const http = httpRouter();
authKit.registerRoutes(http);
http.route({
  path: '/emails/resend/events',
  method: 'POST',
  handler: resendWebhook,
});
export default http;
