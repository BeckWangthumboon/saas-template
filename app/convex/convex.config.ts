import actionRetrier from '@convex-dev/action-retrier/convex.config.js';
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import resend from '@convex-dev/resend/convex.config.js';
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config';
import workpool from '@convex-dev/workpool/convex.config.js';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(actionRetrier);
app.use(rateLimiter);
app.use(resend);
app.use(workpool, { name: 'workosWorkpool' });
app.use(workOSAuthKit);
export default app;
