import { v } from 'convex/values';

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
  `/workspaces/${workspaceId}/settings/billing`;

const getCheckoutSuccessUrl = (workspaceId: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceId)}?checkout=success`;

const getCheckoutReturnUrl = (workspaceId: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceId)}`;

const getPortalReturnUrl = (workspaceId: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceId)}`;

const assertBillingState = (
  value: unknown,
): value is { providerCustomerId?: string; providerSubscriptionId?: string } => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeState = value as { providerCustomerId?: unknown; providerSubscriptionId?: unknown };

  return (
    (maybeState.providerCustomerId === undefined ||
      typeof maybeState.providerCustomerId === 'string') &&
    (maybeState.providerSubscriptionId === undefined ||
      typeof maybeState.providerSubscriptionId === 'string')
  );
};

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
      return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_STATE_MISSING, {
        workspaceId: args.workspaceId,
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
 * @throws BILLING_PLAN_PRODUCT_MAPPING_MISSING if the plan has no Polar product mapping.
 */
export const startCheckout = action({
  args: {
    workspaceId: v.id('workspaces'),
    planKey: paidPlanKeyValidator,
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const billingStateResult: unknown = await ctx.runQuery(
      internal.billing.internal.getWorkspaceBillingState,
      {
        workspaceId: args.workspaceId,
      },
    );

    if (billingStateResult !== null && !assertBillingState(billingStateResult)) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Invalid billing state payload from internal billing query',
      });
    }

    const billingState = billingStateResult;

    const productId = PLAN_KEY_TO_PRODUCT_ID[args.planKey];
    if (!productId) {
      return throwAppErrorForConvex(ErrorCode.BILLING_PLAN_PRODUCT_MAPPING_MISSING, {
        planKey: args.planKey,
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
      return throwAppErrorForConvex(ErrorCode.BILLING_CHECKOUT_CREATE_FAILED, {
        message: error instanceof Error ? error.message : String(error),
      });
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
 * @throws BILLING_CUSTOMER_ID_MISSING if no Polar customer ID can be resolved.
 */
export const createBillingPortalSession = action({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const billingStateResult: unknown = await ctx.runQuery(
      internal.billing.internal.getWorkspaceBillingState,
      {
        workspaceId: args.workspaceId,
      },
    );

    if (billingStateResult !== null && !assertBillingState(billingStateResult)) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Invalid billing state payload from internal billing query',
      });
    }

    const billingState = billingStateResult;

    let customerId = billingState?.providerCustomerId ?? undefined;
    if (!customerId && billingState?.providerSubscriptionId) {
      try {
        const subscription = await polar.subscriptions.get({
          id: billingState.providerSubscriptionId,
        });
        customerId = subscription.customerId;
      } catch (error) {
        return throwAppErrorForConvex(ErrorCode.BILLING_SUBSCRIPTION_FETCH_FAILED, {
          subscriptionId: billingState.providerSubscriptionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!customerId) {
      return throwAppErrorForConvex(ErrorCode.BILLING_CUSTOMER_ID_MISSING, {
        workspaceId: args.workspaceId,
      });
    }

    try {
      const session = await polar.customerSessions.create({
        customerId,
        returnUrl: getPortalReturnUrl(args.workspaceId),
      });

      return { url: session.customerPortalUrl };
    } catch (error) {
      return throwAppErrorForConvex(ErrorCode.BILLING_PORTAL_SESSION_CREATE_FAILED, {
        customerId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
