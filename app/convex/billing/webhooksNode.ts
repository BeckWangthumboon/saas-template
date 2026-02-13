'use node';

import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { v } from 'convex/values';

import { convexEnv } from '../env';
import { internalAction } from '../functions';
import { logger } from '../logging';

type PolarWebhookEvent = ReturnType<typeof validateEvent>;
type PolarSubscriptionEvent = Extract<
  PolarWebhookEvent,
  { type: 'subscription.created' | 'subscription.updated' }
>;

const isPolarSubscriptionEvent = (value: PolarWebhookEvent): value is PolarSubscriptionEvent => {
  return value.type === 'subscription.created' || value.type === 'subscription.updated';
};

const getWorkspaceIdFromMetadata = (metadata: Record<string, unknown> | undefined) => {
  const workspaceId = metadata?.workspaceId;
  return typeof workspaceId === 'string' ? workspaceId : undefined;
};

const parseTimestampMs = (value: unknown) => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (typeof value === 'number') {
    return value;
  }
  return undefined;
};

/**
 * Verifies the Polar webhook signature in Node runtime and normalizes
 * subscription event payloads for the HTTP webhook handler.
 *
 * @param _ctx - The Convex internal action context.
 * @param args - Raw webhook body and headers.
 * @returns Verification result with normalized fields or validation error metadata.
 */
export const verifyAndNormalizePolarWebhook = internalAction({
  args: {
    body: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (_ctx, args) => {
    const webhookSecret = convexEnv.polarWebhookSecret;

    let event: PolarWebhookEvent;
    try {
      event = validateEvent(args.body, args.headers, webhookSecret);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      if (error instanceof WebhookVerificationError) {
        logger.warn({
          event: 'billing.webhook.invalid_signature',
          category: 'BILLING',
          context: {
            errorName,
          },
          error,
        });

        return {
          status: 'invalid_signature' as const,
          errorMessage,
          errorName,
        };
      }

      logger.warn({
        event: 'billing.webhook.invalid_payload',
        category: 'BILLING',
        context: {
          errorName,
        },
        error,
      });

      return {
        status: 'invalid_payload' as const,
        errorMessage,
        errorName,
      };
    }

    if (!isPolarSubscriptionEvent(event)) {
      logger.debug({
        event: 'billing.webhook.unsupported_event',
        category: 'BILLING',
        context: {
          eventType: event.type,
        },
      });

      return {
        status: 'ignored' as const,
        eventType: event.type,
      };
    }

    const subscription = event.data;
    const subscriptionId = subscription.id;
    const customerId = subscription.customerId;
    const productId = subscription.productId;
    const subscriptionStatus = subscription.status;

    logger.debug({
      event: 'billing.webhook.normalized',
      category: 'BILLING',
      context: {
        eventType: event.type,
        workspaceId: getWorkspaceIdFromMetadata(subscription.metadata),
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
    });

    return {
      status: 'subscription' as const,
      eventType: event.type,
      eventTimestamp: parseTimestampMs(event.timestamp),
      subscriptionId,
      customerId,
      productId,
      subscriptionStatus,
      currentPeriodEnd: parseTimestampMs(subscription.currentPeriodEnd),
      subscriptionUpdatedAt: parseTimestampMs(subscription.modifiedAt),
      cancelAtPeriodEnd:
        typeof subscription.cancelAtPeriodEnd === 'boolean'
          ? subscription.cancelAtPeriodEnd
          : false,
      workspaceId: getWorkspaceIdFromMetadata(subscription.metadata),
    };
  },
});
