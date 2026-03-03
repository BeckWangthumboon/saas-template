import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_CONVEX_URL: z.url(),
    VITE_WORKOS_CLIENT_ID: z.string().min(1),
    VITE_WORKOS_REDIRECT_URI: z.url(),
  },

  runtimeEnv: import.meta.env,
});

export { env };
