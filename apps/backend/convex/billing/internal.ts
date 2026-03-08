import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { throwAppErrorForConvex } from '../errors';
import { internalQuery } from '../functions';
import { getActiveWorkspaceById, isActiveWorkspace } from '../workspaces/helpers';
import { getWorkspaceMembership, requireWorkspaceAdminOrOwner } from '../workspaces/utils';
import {
  billingStateValidator,
  workspaceBillingCustomerValidator,
  workspaceLookupArgFields,
} from './types';

const resolveWorkspaceForBilling = async (
  ctx: Parameters<typeof getWorkspaceMembership>[0],
  args: {
    workspaceId?: Parameters<typeof getActiveWorkspaceById>[1];
    workspaceKey?: string;
  },
) => {
  if (!args.workspaceId && !args.workspaceKey) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Expected workspaceId or workspaceKey for billing workspace resolution',
    });
  }

  const workspace = args.workspaceId
    ? await getActiveWorkspaceById(ctx, args.workspaceId)
    : await ctx.db
        .query('workspaces')
        .withIndex('by_workspaceKey', (q) => q.eq('workspaceKey', args.workspaceKey ?? ''))
        .unique();

  if (!workspace || !isActiveWorkspace(workspace)) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
      workspaceId: String(args.workspaceId ?? args.workspaceKey),
    });
  }

  if (args.workspaceKey && workspace.workspaceKey !== args.workspaceKey) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Workspace key does not match the resolved billing workspace',
    });
  }

  return workspace;
};

/**
 * Fetches billing state for a workspace and ensures the caller is an admin or owner.
 *
 * @param workspaceId - The workspace to fetch billing state for.
 * @returns The billing state projection or null if it does not exist.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if the caller is not an admin or owner.
 */
export const getWorkspaceBillingState = internalQuery({
  args: { workspaceId: v.id('workspaces') },
  returns: v.union(v.null(), billingStateValidator),
  handler: async (ctx, args) => {
    await requireWorkspaceAdminOrOwner(ctx, args.workspaceId, 'billing_access');

    const state = await ctx.db
      .query('workspaceBillingState')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
      .unique();

    if (!state) {
      return null;
    }

    return {
      workspaceId: state.workspaceId,
      planKey: state.planKey,
      status: state.status,
      periodEnd: state.periodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      providerCustomerId: state.providerCustomerId,
      providerSubscriptionId: state.providerSubscriptionId,
      updatedAt: state.updatedAt,
    };
  },
});

export const getCustomerForMember = internalQuery({
  args: workspaceLookupArgFields,
  returns: workspaceBillingCustomerValidator,
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspaceForBilling(ctx, args);

    await getWorkspaceMembership(ctx, workspace._id);

    return {
      workspaceId: workspace._id,
      workspaceKey: workspace.workspaceKey,
      workspaceName: workspace.name,
    };
  },
});

export const getCustomerForManager = internalQuery({
  args: workspaceLookupArgFields,
  returns: workspaceBillingCustomerValidator,
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspaceForBilling(ctx, args);

    await requireWorkspaceAdminOrOwner(ctx, workspace._id, 'billing_access');

    return {
      workspaceId: workspace._id,
      workspaceKey: workspace.workspaceKey,
      workspaceName: workspace.name,
    };
  },
});
