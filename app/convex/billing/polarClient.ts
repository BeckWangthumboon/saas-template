import { Polar } from '@polar-sh/sdk';
import { ConvexError } from 'convex/values';

const requireEnv = (value: string | undefined, name: string): string => {
  if (value === undefined || value.trim().length === 0) {
    throw new ConvexError(`${name} environment variable is not set`);
  }
  return value;
};

const organizationToken = requireEnv(
  process.env.POLAR_ORGANIZATION_TOKEN,
  'POLAR_ORGANIZATION_TOKEN',
);
const webhookSecret = requireEnv(process.env.POLAR_WEBHOOK_SECRET, 'POLAR_WEBHOOK_SECRET');

export const polar = new Polar({
  accessToken: organizationToken,
  server: 'sandbox',
});

export const polarWebhookSecret = webhookSecret;
