const defaults = {
  APP_ENV: 'dev',
  APP_ORIGIN: 'https://app.example.test',
  CONVEX_LOG_LEVEL: 'debug',
  POLAR_ORGANIZATION_TOKEN: 'polar-token',
  POLAR_PRO_MONTHLY_PRODUCT_ID: 'prod_monthly',
  POLAR_PRO_YEARLY_PRODUCT_ID: 'prod_yearly',
  POLAR_SERVER: 'sandbox',
  POLAR_WEBHOOK_SECRET: 'polar-webhook-secret',
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_BUCKET: 'bucket',
  R2_ENDPOINT: 'https://r2.example.test',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  RESEND_API_KEY: 'resend-token',
  RESEND_FROM_EMAIL: 'noreply@example.test',
  RESEND_WEBHOOK_SECRET: 'resend-webhook-secret',
  WORKOS_API_KEY: 'workos-api-key',
  WORKOS_CLIENT_ID: 'workos-client-id',
  WORKOS_WEBHOOK_SECRET: 'workos-webhook-secret',
} as const;

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
