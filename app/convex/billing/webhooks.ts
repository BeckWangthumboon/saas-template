import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { ConvexError, v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { httpAction, internalMutation } from '../functions';
import { resolvePlanKeyFromProductId } from './entitlements';
import { polarWebhookSecret } from './polarClient';

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
      throw new ConvexError(`Unknown subscription status: ${status}`);
  }
};

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
    return new Response('Missing webhook-id header', { status: 400 });
  }

  const body = await request.text();

  let event: PolarWebhookEvent;
  try {
    event = validateEvent(body, headers, polarWebhookSecret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response('Invalid webhook signature', { status: 400 });
    }
    return new Response('Invalid webhook payload', { status: 400 });
  }

  if (!isPolarSubscriptionEvent(event)) {
    return new Response('ignored', { status: 200 });
  }

  const subscription = event.data;
  const subscriptionId = subscription.id;
  const customerId = subscription.customerId;
  const productId = subscription.productId;
  const status = subscription.status;

  if (
    typeof subscriptionId !== 'string' ||
    typeof customerId !== 'string' ||
    typeof productId !== 'string' ||
    typeof status !== 'string'
  ) {
    return new Response('Invalid subscription payload', { status: 400 });
  }

  const currentPeriodEndMs = parseTimestampMs(subscription.currentPeriodEnd);
  const subscriptionUpdatedAt = parseTimestampMs(subscription.modifiedAt);
  const eventTimestamp = parseTimestampMs(event.timestamp);

  const cancelAtPeriodEnd =
    typeof subscription.cancelAtPeriodEnd === 'boolean' ? subscription.cancelAtPeriodEnd : false;

  const workspaceId = getWorkspaceIdFromMetadata(
    subscription.metadata as Record<string, unknown> | undefined,
  );

  await ctx.runMutation(internal.billing.webhooks.handlePolarSubscriptionEvent, {
    eventId: webhookId,
    eventType: event.type,
    eventTimestamp,
    subscriptionId,
    customerId,
    productId,
    status,
    currentPeriodEnd: Number.isFinite(currentPeriodEndMs) ? currentPeriodEndMs : undefined,
    subscriptionUpdatedAt: Number.isFinite(subscriptionUpdatedAt)
      ? subscriptionUpdatedAt
      : undefined,
    cancelAtPeriodEnd,
    workspaceId,
  });

  return new Response('ok', { status: 200 });
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
      return null;
    }

    const eventDocId = await ctx.db.insert('billingEvents', {
      providerEventId: args.eventId,
      type: args.eventType,
      receivedAt: Date.now(),
      status: 'received',
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

      const baseUpdates = {
        workspaceId: normalizedWorkspaceId,
        planKey,
        status: mappedStatus,
        periodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        providerCustomerId: args.customerId,
        providerSubscriptionId: args.subscriptionId,
        updatedAt: Date.now(),
      };

      const updates =
        incomingUpdatedAt === undefined
          ? baseUpdates
          : { ...baseUpdates, providerSubscriptionUpdatedAt: incomingUpdatedAt };

      if (existingState) {
        await ctx.db.patch('workspaceBillingState', existingState._id, updates);
      } else {
        await ctx.db.insert('workspaceBillingState', updates);
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
