import actionRetrier from '@convex-dev/action-retrier/convex.config.js';
import polar from '@convex-dev/polar/convex.config';
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config';
import workpool from '@convex-dev/workpool/convex.config.js';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(actionRetrier);
app.use(polar, { name: 'polar' });
app.use(workpool, { name: 'workosWorkpool' });
app.use(workOSAuthKit);

export default app;
