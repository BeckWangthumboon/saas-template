import { v } from 'convex/values';

import { internalQuery } from '../functions';
import { requireWorkspaceAdminOrOwner } from '../workspaces/utils';
import { billingStateValidator } from './types';

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
