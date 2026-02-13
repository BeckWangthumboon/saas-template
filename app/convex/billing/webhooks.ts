import type { FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';

import { ErrorCode } from '../../shared/errors';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';
import { httpAction, internalMutation } from '../functions';
import { logger } from '../logging';
import { isActiveWorkspace } from '../workspaces/helpers';
import { resolvePlanKeyFromProductId } from './products';

const mapSubscriptionStatus = (
  status: string,
  cancelAtPeriodEnd: boolean,
): 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' => {
  if (status === 'canceled' && cancelAtPeriodEnd) {
    return 'active';
  }

  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return throwAppErrorForConvex(ErrorCode.BILLING_SUBSCRIPTION_STATUS_UNKNOWN, { status });
  }
};

type WebhookVerificationResult = FunctionReturnType<
  typeof internal.billing.webhooksNode.verifyAndNormalizePolarWebhook
>;

/**
 * Polar webhook HTTP endpoint. Verifies the signature, filters for subscription
 * events, and forwards normalized payload data to the internal handler.
 *
 * @param ctx - The Convex HTTP action context.
 * @param request - The incoming webhook request.
 * @returns A response indicating webhook processing result.
 */
export const polarWebhook = httpAction(async (ctx, request) => {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const webhookId = headers['webhook-id'];

  if (!webhookId) {
    logger.warn({
      event: 'billing.webhook.rejected',
      category: 'BILLING',
      context: {
        reason: 'missing_webhook_id',
      },
    });
    return new Response('Missing webhook-id header', { status: 400 });
  }

  const body = await request.text();

  let verificationResult: WebhookVerificationResult;
  try {
    verificationResult = await ctx.runAction(
      internal.billing.webhooksNode.verifyAndNormalizePolarWebhook,
      {
        body,
        headers,
      },
    );
  } catch {
    logger.error({
      event: 'billing.webhook.verification_failed',
      category: 'BILLING',
      context: {
        webhookId,
      },
    });
    return new Response('Webhook verification failed', { status: 500 });
  }

  switch (verificationResult.status) {
    case 'invalid_signature':
    case 'invalid_payload': {
      logger.warn({
        event: 'billing.webhook.invalid',
        category: 'BILLING',
        context: {
          webhookId,
          status: verificationResult.status,
          errorName: verificationResult.errorName,
        },
      });

      if (verificationResult.status === 'invalid_signature') {
        return new Response('Invalid webhook signature', { status: 400 });
      }

      return new Response('Invalid webhook payload', { status: 400 });
    }
    case 'ignored': {
      logger.debug({
        event: 'billing.webhook.ignored',
        category: 'BILLING',
        context: {
          webhookId,
          eventType: verificationResult.eventType,
        },
      });
      return new Response('ignored', { status: 200 });
    }
    case 'subscription': {
      logger.info({
        event: 'billing.webhook.subscription_received',
        category: 'BILLING',
        context: {
          webhookId,
          eventType: verificationResult.eventType,
          workspaceId: verificationResult.workspaceId,
          subscriptionId: verificationResult.subscriptionId,
          status: verificationResult.subscriptionStatus,
        },
      });

      await ctx.runMutation(internal.billing.webhooks.handlePolarSubscriptionEvent, {
        eventId: webhookId,
        eventType: verificationResult.eventType,
        eventTimestamp: verificationResult.eventTimestamp,
        subscriptionId: verificationResult.subscriptionId,
        customerId: verificationResult.customerId,
        productId: verificationResult.productId,
        status: verificationResult.subscriptionStatus,
        currentPeriodEnd: verificationResult.currentPeriodEnd,
        subscriptionUpdatedAt: verificationResult.subscriptionUpdatedAt,
        cancelAtPeriodEnd: verificationResult.cancelAtPeriodEnd,
        workspaceId: verificationResult.workspaceId,
      });

      logger.info({
        event: 'billing.webhook.subscription_acknowledged',
        category: 'BILLING',
        context: {
          webhookId,
          eventType: verificationResult.eventType,
        },
      });

      return new Response('ok', { status: 200 });
    }
  }
});

/**
 * Internal handler for subscription webhook events.
 * Ensures idempotency, resolves workspace, applies plan/status updates, and
 * records the webhook event outcome.
 *
 * @param ctx - The Convex mutation context.
 * @param args - Normalized webhook payload fields.
 * @returns null when handled.
 */
export const handlePolarSubscriptionEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    eventTimestamp: v.optional(v.number()),
    subscriptionId: v.string(),
    customerId: v.string(),
    productId: v.string(),
    status: v.string(),
    currentPeriodEnd: v.optional(v.number()),
    subscriptionUpdatedAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    workspaceId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('billingEvents')
      .withIndex('by_providerEventId', (q) => q.eq('providerEventId', args.eventId))
      .unique();

    if (existing) {
      logger.debug({
        event: 'billing.webhook.duplicate_ignored',
        category: 'BILLING',
        context: {
          eventId: args.eventId,
          eventType: args.eventType,
        },
      });
      return null;
    }

    const eventDocId = await ctx.db.insert('billingEvents', {
      providerEventId: args.eventId,
      type: args.eventType,
      receivedAt: Date.now(),
      status: 'received',
    });

    logger.info({
      event: 'billing.webhook.received',
      category: 'BILLING',
      context: {
        eventId: args.eventId,
        eventType: args.eventType,
        workspaceId: args.workspaceId,
        subscriptionId: args.subscriptionId,
      },
    });

    const finalizeEvent = async (
      status: 'handled' | 'error' | 'unresolved',
      options: { error?: string; workspaceId?: Id<'workspaces'> } = {},
    ) => {
      await ctx.db.patch('billingEvents', eventDocId, {
        status,
        handledAt: Date.now(),
        error: options.error,
        workspaceId: options.workspaceId,
      });

      if (status === 'handled') {
        logger.info({
          event: 'billing.webhook.handled',
          category: 'BILLING',
          context: {
            eventId: args.eventId,
            eventType: args.eventType,
            workspaceId: options.workspaceId,
          },
        });
      }

      if (status === 'unresolved') {
        logger.warn({
          event: 'billing.webhook.unresolved',
          category: 'BILLING',
          context: {
            eventId: args.eventId,
            eventType: args.eventType,
            workspaceId: options.workspaceId,
            reason: options.error,
          },
        });
      }

      if (status === 'error') {
        logger.error({
          event: 'billing.webhook.error',
          category: 'BILLING',
          context: {
            eventId: args.eventId,
            eventType: args.eventType,
            workspaceId: options.workspaceId,
          },
          error: options.error,
        });
      }
    };

    try {
      if (!args.workspaceId) {
        await finalizeEvent('unresolved', { error: 'Missing workspaceId' });
        return null;
      }

      const normalizedWorkspaceId = ctx.db.normalizeId('workspaces', args.workspaceId);
      if (!normalizedWorkspaceId) {
        await finalizeEvent('unresolved', { error: 'Invalid workspaceId' });
        return null;
      }

      const workspace = await ctx.db.get('workspaces', normalizedWorkspaceId);
      if (!workspace || !isActiveWorkspace(workspace)) {
        await finalizeEvent('unresolved', { error: 'Workspace not active' });
        return null;
      }

      const existingState = await ctx.db
        .query('workspaceBillingState')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', normalizedWorkspaceId))
        .unique();

      if (
        existingState?.providerSubscriptionId &&
        existingState.providerSubscriptionId !== args.subscriptionId &&
        existingState.status !== 'none' &&
        existingState.status !== 'canceled'
      ) {
        await finalizeEvent('handled', { workspaceId: normalizedWorkspaceId });
        return null;
      }

      const incomingUpdatedAt = args.subscriptionUpdatedAt ?? args.eventTimestamp;

      if (
        typeof incomingUpdatedAt === 'number' &&
        existingState?.providerSubscriptionUpdatedAt !== undefined &&
        incomingUpdatedAt < existingState.providerSubscriptionUpdatedAt
      ) {
        await finalizeEvent('handled', { workspaceId: normalizedWorkspaceId });
        return null;
      }

      const planKey = resolvePlanKeyFromProductId(args.productId);
      const mappedStatus = mapSubscriptionStatus(args.status, args.cancelAtPeriodEnd);
      const pastDueAt =
        mappedStatus === 'past_due'
          ? (existingState?.pastDueAt ?? incomingUpdatedAt ?? Date.now())
          : undefined;

      const baseUpdates = {
        workspaceId: normalizedWorkspaceId,
        planKey,
        status: mappedStatus,
        periodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        providerCustomerId: args.customerId,
        providerSubscriptionId: args.subscriptionId,
        pastDueAt,
        updatedAt: Date.now(),
      };

      const updates =
        incomingUpdatedAt === undefined
          ? baseUpdates
          : { ...baseUpdates, providerSubscriptionUpdatedAt: incomingUpdatedAt };

      if (existingState) {
        const previousStatus = existingState.status;
        await ctx.db.patch('workspaceBillingState', existingState._id, updates);

        logger.info({
          event: 'billing.workspace_state.updated',
          category: 'BILLING',
          context: {
            eventId: args.eventId,
            workspaceId: normalizedWorkspaceId,
            previousStatus,
            nextStatus: mappedStatus,
            planKey,
          },
        });
      } else {
        await ctx.db.insert('workspaceBillingState', updates);

        logger.info({
          event: 'billing.workspace_state.created',
          category: 'BILLING',
          context: {
            eventId: args.eventId,
            workspaceId: normalizedWorkspaceId,
            nextStatus: mappedStatus,
            planKey,
          },
        });
      }

      await finalizeEvent('handled', { workspaceId: normalizedWorkspaceId });
      return null;
    } catch (error) {
      await finalizeEvent('error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
});
