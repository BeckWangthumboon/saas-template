import { Resend } from '@convex-dev/resend';

import { components, internal } from '../_generated/api';
import { convexEnv } from '../env';

/**
 * Shared Resend client configured with a universal event callback.
 */
export const resend: Resend = new Resend(components.resend, {
  apiKey: convexEnv.resendApiKey,
  webhookSecret: convexEnv.resendWebhookSecret,
  testMode: convexEnv.resendTestMode,
  onEmailEvent: internal.emails.events.handleEmailEvent,
});
