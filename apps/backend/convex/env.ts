import { createAppErrorForConvex, ErrorCode } from '@saas/shared/errors';

type PolarServer = 'sandbox' | 'production';
type ConvexLogLevel = 'debug' | 'info' | 'warn' | 'error';
type AppEnvironment = 'dev' | 'prod';

/**
 * Reads a required environment variable and returns a trimmed value.
 *
 * @param name - Environment variable name.
 * @returns Trimmed environment variable value.
 * @throws ConvexError when the variable is missing or empty.
 */
const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: `Missing required environment variable: ${name}`,
    });
  }
  return value.trim();
};

/**
 * Parses and validates the Polar server environment setting.
 *
 * Defaults to `sandbox` when `POLAR_SERVER` is unset.
 *
 * @returns Polar server target (`sandbox` or `production`).
 * @throws ConvexError when `POLAR_SERVER` has an unsupported value.
 */
const parsePolarServer = (): PolarServer => {
  const value = process.env.POLAR_SERVER?.trim().toLowerCase();
  if (value === undefined || value.length === 0) {
    return 'sandbox';
  }

  if (value === 'sandbox' || value === 'production') {
    return value;
  }

  throw createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
    details: "POLAR_SERVER must be either 'sandbox' or 'production'",
  });
};

/**
 * Parses and validates the configured Convex backend log level.
 *
 * Defaults to `info` when `CONVEX_LOG_LEVEL` is unset.
 *
 * @returns Log level threshold for structured backend logs.
 * @throws ConvexError when `CONVEX_LOG_LEVEL` has an unsupported value.
 */
const parseConvexLogLevel = (): ConvexLogLevel => {
  const value = process.env.CONVEX_LOG_LEVEL?.trim().toLowerCase();
  if (value === undefined || value.length === 0) {
    return 'info';
  }

  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }

  throw createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
    details: "CONVEX_LOG_LEVEL must be one of 'debug', 'info', 'warn', or 'error'",
  });
};

/**
 * Parses and validates the app runtime environment.
 *
 * Defaults to `dev` when `APP_ENV` is unset to optimize local template usage.
 *
 * @returns App environment (`dev` or `prod`).
 * @throws ConvexError when `APP_ENV` has an unsupported value.
 */
const parseAppEnvironment = (): AppEnvironment => {
  const value = process.env.APP_ENV?.trim().toLowerCase();
  if (value === undefined || value.length === 0) {
    return 'dev';
  }

  if (value === 'dev' || value === 'prod') {
    return value;
  }

  throw createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
    details: "APP_ENV must be either 'dev' or 'prod'",
  });
};

/**
 * Parses and normalizes the frontend app origin used in billing redirect URLs.
 *
 * @returns App origin without a trailing slash.
 * @throws ConvexError when `APP_ORIGIN` is missing or not a valid URL.
 */
const parseAppOrigin = (): string => {
  const value = requireEnv('APP_ORIGIN');

  try {
    const url = new URL(value);
    return url.toString().replace(/\/$/, '');
  } catch {
    throw createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'APP_ORIGIN must be a valid URL (for example https://example.com)',
    });
  }
};

/**
 * Loads and validates Polar plan product IDs.
 *
 * Ensures monthly and yearly IDs are both present and distinct.
 *
 * @returns Polar product ID mapping for monthly and yearly plans.
 * @throws ConvexError when either ID is missing or both are identical.
 */
const parsePolarProductIds = () => {
  const proMonthlyProductId = requireEnv('POLAR_PRO_MONTHLY_PRODUCT_ID');
  const proYearlyProductId = requireEnv('POLAR_PRO_YEARLY_PRODUCT_ID');

  if (proMonthlyProductId === proYearlyProductId) {
    throw createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'POLAR product IDs must be unique',
    });
  }

  return {
    proMonthlyProductId,
    proYearlyProductId,
  };
};

const productIds = parsePolarProductIds();
const appEnv = parseAppEnvironment();

/**
 * Centralized, validated Convex runtime environment configuration.
 *
 * This object is evaluated at module load, so missing or invalid values fail fast.
 *
 * @throws ConvexError when any required environment variable is invalid.
 */
export const convexEnv = {
  appEnv,
  workosClientId: requireEnv('WORKOS_CLIENT_ID'),
  workosApiKey: requireEnv('WORKOS_API_KEY'),
  polarOrganizationToken: requireEnv('POLAR_ORGANIZATION_TOKEN'),
  polarWebhookSecret: requireEnv('POLAR_WEBHOOK_SECRET'),
  polarProMonthlyProductId: productIds.proMonthlyProductId,
  polarProYearlyProductId: productIds.proYearlyProductId,
  polarServer: parsePolarServer(),
  appOrigin: parseAppOrigin(),
  logLevel: parseConvexLogLevel(),
  resendApiKey: requireEnv('RESEND_API_KEY'),
  resendWebhookSecret: requireEnv('RESEND_WEBHOOK_SECRET'),
  resendFromEmail: requireEnv('RESEND_FROM_EMAIL'),
  resendTestMode: false,
} as const;

export type ConvexEnv = typeof convexEnv;
