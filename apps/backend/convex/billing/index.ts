import { AUTUMN_PLAN_IDS } from '@saas/shared/billing/ids';
import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { getPlanTier } from '../entitlements/service';
import { convexEnv } from '../env';
import { throwAppErrorForConvex } from '../errors';
import { action, query, type QueryCtx } from '../functions';
import { logger } from '../logging';
import { getWorkspaceMembership } from '../workspaces/utils';
import {
  billingPortal as autumnBillingPortal,
  check as autumnCheck,
  checkout as autumnCheckout,
  track as autumnTrack,
  type WorkspaceBillingCustomer,
} from './autumn';
import { billingSummaryValidator, paidPlanKeyValidator, workspaceLookupArgFields } from './types';

const ORIGIN = convexEnv.appOrigin;

const getWorkspaceBillingSettingsPath = (workspaceKey: string) =>
  `/w/${workspaceKey}/settings/billing`;

const getCheckoutSuccessUrl = (workspaceKey: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceKey)}?checkout=success`;

const getPortalReturnUrl = (workspaceKey: string) =>
  `${ORIGIN}${getWorkspaceBillingSettingsPath(workspaceKey)}`;

const workspaceFeatureCheckResultValidator = v.object({
  allowed: v.boolean(),
  customerId: v.string(),
  featureId: v.string(),
});

const workspaceFeatureTrackResultValidator = v.object({
  id: v.string(),
  code: v.string(),
  customerId: v.string(),
  featureId: v.optional(v.string()),
  eventName: v.optional(v.string()),
});

/**
 * Fetches workspace billing state for a member.
 *
 * @param ctx - Convex query context.
 * @param workspaceId - The workspace to resolve billing state for.
 * @returns Workspace billing state.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws BILLING_WORKSPACE_STATE_MISSING if billing state does not exist.
 */
const getWorkspaceBillingStateForMember = async (ctx: QueryCtx, workspaceId: Id<'workspaces'>) => {
  await getWorkspaceMembership(ctx, workspaceId);

  const state = await ctx.db
    .query('workspaceBillingState')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .unique();

  if (!state) {
    return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_STATE_MISSING, {
      workspaceId,
    });
  }

  return state;
};

/**
 * Returns billing projection for a workspace.
 *
 * @param workspaceId - The workspace to read billing data for.
 * @returns Billing summary including plan and provider billing status.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws BILLING_WORKSPACE_STATE_MISSING if billing state does not exist.
 */
export const getWorkspaceBillingSummary = query({
  args: { workspaceId: v.id('workspaces') },
  returns: billingSummaryValidator,
  handler: async (ctx, args) => {
    const state = await getWorkspaceBillingStateForMember(ctx, args.workspaceId);

    return {
      workspaceId: args.workspaceId,
      planKey: state.planKey,
      tier: getPlanTier(state.planKey),
      status: state.status,
      periodEnd: state.periodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      updatedAt: state.updatedAt,
    };
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
  returns: workspaceFeatureCheckResultValidator,
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
  returns: workspaceFeatureTrackResultValidator,
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
  returns: v.object({ url: v.string() }),
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
  returns: v.object({ url: v.string() }),
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
