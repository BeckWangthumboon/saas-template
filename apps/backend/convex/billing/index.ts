import { ActionCache } from '@convex-dev/action-cache';
import { AUTUMN_PLAN_IDS } from '@saas/shared/billing/ids';
import { ErrorCode } from '@saas/shared/errors';
import { ProductStatus } from 'autumn-js';
import { v } from 'convex/values';

import { components, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { getPlanTier } from '../entitlements/service';
import { convexEnv } from '../env';
import { throwAppErrorForConvex } from '../errors';
import { action, type ActionCtx, internalAction } from '../functions';
import { logger } from '../logging';
import {
  billingPortal as autumnBillingPortal,
  check as autumnCheck,
  checkout as autumnCheckout,
  getCustomer as autumnGetCustomer,
  track as autumnTrack,
  type WorkspaceBillingCustomer,
} from './autumn';
import { type BillingSummary, paidPlanKeyValidator, workspaceLookupArgFields } from './types';

const ORIGIN = convexEnv.appOrigin;
const BILLING_SUMMARY_CACHE_TTL_MS = 1000 * 30;

const getWorkspaceBillingSettingsPath = (workspaceKey: string) =>
  `/w/${workspaceKey}/settings/billing`;

const getCheckoutSuccessUrl = (workspaceKey: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceKey)}?checkout=success`;

const getPortalReturnUrl = (workspaceKey: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceKey)}`;

type AutumnCustomerResult = Awaited<ReturnType<typeof autumnGetCustomer>>;
type AutumnCustomer = Exclude<AutumnCustomerResult['data'], null>;
type AutumnCustomerProduct = AutumnCustomer['products'][number];
interface WorkspaceBillingSummaryLookupArgs {
  workspaceKey: string;
}

const toPlanKey = (productId: string) => {
  if (productId === AUTUMN_PLAN_IDS.free) {
    return 'free';
  }

  if (productId === AUTUMN_PLAN_IDS.proMonthly) {
    return 'pro_monthly';
  }

  if (productId === AUTUMN_PLAN_IDS.proYearly) {
    return 'pro_yearly';
  }

  return null;
};

const toBillingStatus = (status: AutumnCustomerProduct['status']) => {
  switch (status) {
    case ProductStatus.Trialing:
      return 'trialing';
    case ProductStatus.Active:
      return 'active';
    case ProductStatus.PastDue:
      return 'past_due';
    case ProductStatus.Scheduled:
      return 'scheduled';
    case ProductStatus.Expired:
      return 'expired';
    default:
      return null;
  }
};

const toBillingSummary = (args: {
  workspaceId: Id<'workspaces'>;
  customer: AutumnCustomer | null;
  now?: number;
}): BillingSummary => {
  if (!args.customer) {
    return {
      workspaceId: args.workspaceId,
      planKey: 'free' as const,
      tier: getPlanTier('free'),
      status: 'none' as const,
      periodEnd: undefined,
      cancelAtPeriodEnd: false,
      updatedAt: args.now ?? Date.now(),
    };
  }

  const paidProduct = args.customer.products.find((product) => {
    const planKey = toPlanKey(product.id);
    return planKey !== null && planKey !== 'free' && toBillingStatus(product.status) !== null;
  });

  if (!paidProduct) {
    return {
      workspaceId: args.workspaceId,
      planKey: 'free' as const,
      tier: getPlanTier('free'),
      status: 'none' as const,
      periodEnd: undefined,
      cancelAtPeriodEnd: false,
      updatedAt: args.now ?? Date.now(),
    };
  }

  const planKey = toPlanKey(paidProduct.id);
  const status = toBillingStatus(paidProduct.status);

  if (planKey === null || planKey === 'free' || status === null) {
    return {
      workspaceId: args.workspaceId,
      planKey: 'free',
      tier: getPlanTier('free'),
      status: 'none',
      periodEnd: undefined,
      cancelAtPeriodEnd: false,
      updatedAt: args.now ?? Date.now(),
    };
  }

  return {
    workspaceId: args.workspaceId,
    planKey,
    tier: getPlanTier(planKey),
    status,
    periodEnd: paidProduct.current_period_end ?? paidProduct.trial_ends_at ?? undefined,
    cancelAtPeriodEnd: paidProduct.canceled_at != null,
    updatedAt: args.now ?? Date.now(),
  };
};

const getWorkspaceBillingSummaryFromAutumn = async (
  ctx: ActionCtx,
  args: WorkspaceBillingSummaryLookupArgs,
) => {
  const workspace: WorkspaceBillingCustomer = await ctx.runQuery(
    internal.billing.internal.getCustomerForMember,
    args,
  );

  const result = await autumnGetCustomer(workspace.workspaceId);

  if (result.error) {
    if (result.statusCode === 404) {
      return toBillingSummary({
        workspaceId: workspace.workspaceId,
        customer: null,
      });
    }

    logger.error({
      event: 'billing.summary.failed',
      category: 'BILLING',
      context: {
        workspaceId: workspace.workspaceId,
        errorCode: result.error.code,
        statusCode: result.statusCode,
      },
      error: result.error,
    });

    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Autumn workspace billing summary fetch failed',
    });
  }

  return toBillingSummary({
    workspaceId: workspace.workspaceId,
    customer: result.data,
  });
};

const billingSummaryCache = new ActionCache(components.actionCache, {
  action: internal.billing.index.getWorkspaceBillingSummaryUncached,
  name: 'workspaceBillingSummary',
  ttl: BILLING_SUMMARY_CACHE_TTL_MS,
});

export const getWorkspaceBillingSummaryUncached = internalAction({
  args: {
    workspaceKey: v.string(),
  },
  handler: async (ctx, args) => getWorkspaceBillingSummaryFromAutumn(ctx, args),
});

/**
 * Returns a cached billing projection for a workspace by reading Autumn on demand.
 *
 * @param workspaceKey - The workspace key to read billing data for.
 * @returns Billing summary including plan and provider billing status.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 */
export const getWorkspaceBillingSummary = action({
  args: {
    workspaceKey: v.string(),
    refresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BillingSummary> => {
    const cacheArgs = {
      workspaceKey: args.workspaceKey,
    };

    return billingSummaryCache.fetch(ctx, cacheArgs, { force: args.refresh });
  },
});

export const check = action({
  args: {
    ...workspaceLookupArgFields,
    featureId: v.string(),
    requiredBalance: v.optional(v.number()),
    sendEvent: v.optional(v.boolean()),
    withPreview: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const workspace: WorkspaceBillingCustomer = await ctx.runQuery(
      internal.billing.internal.getCustomerForMember,
      {
        workspaceId: args.workspaceId,
        workspaceKey: args.workspaceKey,
      },
    );

    const result = await autumnCheck({
      workspace,
      featureId: args.featureId,
      requiredBalance: args.requiredBalance,
      sendEvent: args.sendEvent,
      withPreview: args.withPreview,
    });

    if (result.error) {
      logger.error({
        event: 'billing.feature_check.failed',
        category: 'BILLING',
        context: {
          workspaceId: workspace.workspaceId,
          featureId: args.featureId,
          errorCode: result.error.code,
        },
        error: result.error,
      });

      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Autumn workspace feature access check failed',
      });
    }

    return {
      allowed: result.data.allowed,
      customerId: result.data.customer_id,
      featureId: result.data.feature_id,
    };
  },
});

export const track = action({
  args: {
    ...workspaceLookupArgFields,
    featureId: v.optional(v.string()),
    value: v.optional(v.number()),
    eventName: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    properties: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const workspace: WorkspaceBillingCustomer = await ctx.runQuery(
      internal.billing.internal.getCustomerForManager,
      {
        workspaceId: args.workspaceId,
        workspaceKey: args.workspaceKey,
      },
    );

    const result = await autumnTrack({
      workspace,
      featureId: args.featureId,
      value: args.value,
      eventName: args.eventName,
      idempotencyKey: args.idempotencyKey,
      properties: args.properties,
    });

    if (result.error) {
      logger.error({
        event: 'billing.feature_track.failed',
        category: 'BILLING',
        context: {
          workspaceId: workspace.workspaceId,
          featureId: args.featureId,
          eventName: args.eventName,
          errorCode: result.error.code,
        },
        error: result.error,
      });

      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Autumn workspace feature tracking failed',
      });
    }

    return {
      id: result.data.id,
      code: result.data.code,
      customerId: result.data.customer_id,
      featureId: result.data.feature_id,
      eventName: result.data.event_name,
    };
  },
});

/**
 * Starts an Autumn checkout session for a paid workspace plan.
 *
 * @param workspaceId - The workspace to start checkout for.
 * @param planKey - The paid plan to purchase.
 * @returns The checkout URL to redirect the user to.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if the caller is not an admin or owner.
 */
export const checkout = action({
  args: {
    ...workspaceLookupArgFields,
    planKey: paidPlanKeyValidator,
  },
  handler: async (ctx, args) => {
    const workspace: WorkspaceBillingCustomer = await ctx.runQuery(
      internal.billing.internal.getCustomerForManager,
      {
        workspaceId: args.workspaceId,
        workspaceKey: args.workspaceKey,
      },
    );

    const productId =
      args.planKey === 'pro_monthly' ? AUTUMN_PLAN_IDS.proMonthly : AUTUMN_PLAN_IDS.proYearly;

    logger.info({
      event: 'billing.checkout.started',
      category: 'BILLING',
      context: {
        workspaceId: workspace.workspaceId,
        planKey: args.planKey,
        autumnProductId: productId,
      },
    });

    const result = await autumnCheckout({
      workspace,
      productId,
      successUrl: getCheckoutSuccessUrl(workspace.workspaceKey),
    });

    if (result.error) {
      logger.error({
        event: 'billing.checkout.failed',
        category: 'BILLING',
        context: {
          workspaceId: workspace.workspaceId,
          planKey: args.planKey,
          autumnProductId: productId,
          errorCode: result.error.code,
        },
        error: result.error,
      });

      return throwAppErrorForConvex(ErrorCode.BILLING_CHECKOUT_CREATE_FAILED, {
        message: result.error.message,
      });
    }

    return {
      url: result.data.url ?? getCheckoutSuccessUrl(workspace.workspaceKey),
    };
  },
});

/**
 * Creates an Autumn customer portal session for managing billing.
 *
 * @param workspaceId - The workspace to manage billing for.
 * @returns The customer portal URL to redirect the user to.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if the caller is not an admin or owner.
 */
export const billingPortal = action({
  args: workspaceLookupArgFields,
  handler: async (ctx, args) => {
    const workspace: WorkspaceBillingCustomer = await ctx.runQuery(
      internal.billing.internal.getCustomerForManager,
      {
        workspaceId: args.workspaceId,
        workspaceKey: args.workspaceKey,
      },
    );

    logger.info({
      event: 'billing.portal.started',
      category: 'BILLING',
      context: {
        workspaceId: workspace.workspaceId,
        customerId: workspace.workspaceId,
      },
    });

    const result = await autumnBillingPortal({
      workspace,
      returnUrl: getPortalReturnUrl(workspace.workspaceKey),
    });

    if (result.error) {
      logger.error({
        event: 'billing.portal.failed',
        category: 'BILLING',
        context: {
          workspaceId: workspace.workspaceId,
          customerId: workspace.workspaceId,
          errorCode: result.error.code,
        },
        error: result.error,
      });

      return throwAppErrorForConvex(ErrorCode.BILLING_PORTAL_SESSION_CREATE_FAILED, {
        customerId: workspace.workspaceId,
        message: result.error.message,
      });
    }

    return { url: result.data.url };
  },
});
