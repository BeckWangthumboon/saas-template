import { httpAction } from '../functions';
import { logger } from '../logging';
import { resend } from './resend';

const isWebhookValidationError = (error: unknown) => {
  if (error instanceof SyntaxError) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = (error as { name?: unknown }).name;
  return name === 'WebhookVerificationError' || name === 'SyntaxError';
};

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
    const isValidationError = isWebhookValidationError(error);
    const status = isValidationError ? 400 : 500;

    if (isValidationError) {
      logger.warn({
        event: 'email.webhook.rejected',
        category: 'INVITE',
        context: {
          status,
          failureType: 'validation',
        },
        error,
      });

      return new Response('Invalid webhook payload or signature', { status });
    }

    logger.error({
      event: 'email.webhook.failed',
      category: 'INVITE',
      context: {
        status,
        failureType: 'internal',
      },
      error,
    });

    return new Response('Webhook processing failed', { status });
  }
});
