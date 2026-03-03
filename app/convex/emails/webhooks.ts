import { httpAction } from '../functions';
import { logger } from '../logging';
import { resend } from './resend';

/**
 * Receives Resend webhooks and forwards validated events to the resend component.
 *
 * @param ctx - Convex HTTP action context.
 * @param request - Incoming webhook request from Resend.
 * @returns HTTP response for Resend.
 */
export const resendWebhook = httpAction(async (ctx, request) => {
  try {
    const response = await resend.handleResendEventWebhook(ctx, request);

    logger.debug({
      event: 'email.webhook.handled',
      category: 'INVITE',
      context: {
        status: response.status,
      },
    });

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const status = errorMessage.includes('Webhook secret is not set') ? 500 : 400;

    logger.warn({
      event: 'email.webhook.rejected',
      category: 'INVITE',
      context: {
        status,
      },
      error,
    });

    return new Response('Invalid webhook payload or signature', { status });
  }
});
