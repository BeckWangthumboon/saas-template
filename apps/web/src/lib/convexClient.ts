import { ConvexReactClient } from 'convex/react';

import { env } from '@/env';

export const convexClient = new ConvexReactClient(env.VITE_CONVEX_URL, {
  expectAuth: true,
});
