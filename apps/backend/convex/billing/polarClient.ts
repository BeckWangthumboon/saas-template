import { Polar } from '@polar-sh/sdk';

import { convexEnv } from '../env';

export const polar = new Polar({
  accessToken: convexEnv.polarOrganizationToken,
  server: convexEnv.polarServer,
});
