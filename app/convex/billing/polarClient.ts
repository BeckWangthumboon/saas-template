import { Polar } from '@polar-sh/sdk';

import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';

const requireEnv = (value: string | undefined, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: `${name} environment variable is not set`,
    });
  }
  return value;
};

type PolarServer = 'sandbox' | 'production';

const getPolarServer = (): PolarServer => {
  const value = process.env.POLAR_SERVER?.trim().toLowerCase();
  if (value === undefined || value.length === 0) {
    return 'sandbox';
  }
  if (value === 'sandbox' || value === 'production') {
    return value;
  }
  return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
    details: "POLAR_SERVER must be either 'sandbox' or 'production'",
  });
};

const organizationToken = requireEnv(
  process.env.POLAR_ORGANIZATION_TOKEN,
  'POLAR_ORGANIZATION_TOKEN',
);
const webhookSecret = requireEnv(process.env.POLAR_WEBHOOK_SECRET, 'POLAR_WEBHOOK_SECRET');
const server = getPolarServer();

export const polar = new Polar({
  accessToken: organizationToken,
  server,
});

export const polarWebhookSecret = webhookSecret;
