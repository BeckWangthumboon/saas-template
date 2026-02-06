import { ConvexError, v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';
import { internal } from '../_generated/api';
import { action, query } from '../functions';
import { getWorkspaceMembership } from '../workspaces/utils';
import { getPlanTier, PLAN_KEY_TO_PRODUCT_ID } from './entitlements';
import { polar } from './polarClient';
import { billingSummaryValidator, paidPlanKeyValidator } from './types';

const PAST_DUE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const ORIGIN = (process.env.APP_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');

const getWorkspaceBillingSettingsPath = (workspaceId: string) =>
  `/workspaces/${workspaceId}/settings/workspace`;

const getCheckoutSuccessUrl = (workspaceId: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceId)}?checkout=success`;

const getCheckoutReturnUrl = (workspaceId: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceId)}`;

const getPortalReturnUrl = (workspaceId: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceId)}`;

/**
 * Returns billing projection and derived entitlements for a workspace.
 *
 * @param workspaceId - The workspace to read billing data for.
 * @returns Billing summary including derived tier and grace-period status.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 */
export const getWorkspaceBillingSummary = query({
  args: { workspaceId: v.id('workspaces') },
  returns: billingSummaryValidator,
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);

    const state = await ctx.db
      .query('workspaceBillingState')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
      .unique();

    if (!state) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: `Missing billing state for workspace ${args.workspaceId}`,
      });
    }

    const now = Date.now();
    const planKey = state.planKey;
    const status = state.status;
    const pastDueAt = state.pastDueAt;
    const graceEndsAt = pastDueAt ? pastDueAt + PAST_DUE_GRACE_PERIOD_MS : undefined;
    const isInGrace = status === 'past_due' && pastDueAt !== undefined && now < (graceEndsAt ?? 0);
    const effectiveStatus = status === 'past_due' && isInGrace ? 'active' : status;

    return {
      workspaceId: args.workspaceId,
      planKey,
      tier: getPlanTier(planKey),
      status,
      effectiveStatus,
      periodEnd: state.periodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      pastDueAt,
      graceEndsAt,
      isInGrace,
      updatedAt: state.updatedAt,
    };
  },
});

/**
 * Starts a Polar checkout session for a paid plan.
 *
 * @param workspaceId - The workspace to start checkout for.
 * @param planKey - The paid plan to purchase.
 * @returns The checkout URL to redirect the user to.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if the caller is not an admin or owner.
 * @throws INTERNAL_ERROR if the plan is missing a Polar product mapping.
 */
export const startCheckout = action({
  args: {
    workspaceId: v.id('workspaces'),
    planKey: paidPlanKeyValidator,
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const billingState = await ctx.runQuery(internal.billing.internal.getWorkspaceBillingState, {
      workspaceId: args.workspaceId,
    });

    const productId = PLAN_KEY_TO_PRODUCT_ID[args.planKey];
    if (!productId) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: `Missing Polar product mapping for ${args.planKey}`,
      });
    }

    const checkoutRequest: Parameters<typeof polar.checkouts.create>[0] = {
      products: [productId],
      successUrl: getCheckoutSuccessUrl(args.workspaceId),
      returnUrl: getCheckoutReturnUrl(args.workspaceId),
      metadata: { workspaceId: args.workspaceId },
    };

    if (billingState?.providerCustomerId) {
      checkoutRequest.customerId = billingState.providerCustomerId;
    }

    try {
      const checkout = await polar.checkouts.create(checkoutRequest);
      return { url: checkout.url };
    } catch (error) {
      throw new ConvexError(
        `Failed to create Polar checkout: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Creates a Polar customer portal session for managing billing.
 *
 * @param workspaceId - The workspace to manage billing for.
 * @returns The customer portal URL to redirect the user to.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if the caller is not an admin or owner.
 * @throws INTERNAL_ERROR if no Polar customer ID can be resolved.
 */
export const createBillingPortalSession = action({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const billingState = await ctx.runQuery(internal.billing.internal.getWorkspaceBillingState, {
      workspaceId: args.workspaceId,
    });

    let customerId = billingState?.providerCustomerId ?? undefined;
    if (!customerId && billingState?.providerSubscriptionId) {
      try {
        const subscription = await polar.subscriptions.get({
          id: billingState.providerSubscriptionId,
        });
        customerId = subscription.customerId;
      } catch (error) {
        throw new ConvexError(
          `Failed to fetch Polar subscription: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!customerId) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Missing Polar customer ID for billing portal session',
      });
    }

    try {
      const session = await polar.customerSessions.create({
        customerId,
        returnUrl: getPortalReturnUrl(args.workspaceId),
      });

      return { url: session.customerPortalUrl };
    } catch (error) {
      throw new ConvexError(
        `Failed to create Polar customer session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },
});
