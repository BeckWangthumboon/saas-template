import { v } from 'convex/values';

import { query } from '../functions';
import { getWorkspaceMembership } from '../workspaces/utils';
import { getWorkspaceEntitlementsSnapshot } from './service';
import { workspaceEntitlementsSummaryValidator } from './types';

/**
 * Returns derived workspace entitlements for UI gating and server-side checks.
 *
 * @param workspaceId - The workspace to read entitlement data for.
 * @returns Workspace entitlement snapshot including capabilities, lock/grace flags, and usage.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 * @throws BILLING_WORKSPACE_STATE_MISSING if billing state does not exist.
 */
export const getWorkspaceEntitlements = query({
  args: { workspaceId: v.id('workspaces') },
  returns: workspaceEntitlementsSummaryValidator,
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);

    const { entitlements } = await getWorkspaceEntitlementsSnapshot(ctx, args.workspaceId);

    return {
      workspaceId: args.workspaceId,
      plan: {
        key: entitlements.effectivePlanKey,
      },
      limits: entitlements.limits,
      usage: entitlements.usage,
      lifecycle: {
        status: entitlements.effectiveStatus,
        isLocked: entitlements.isLocked,
        isInGrace: entitlements.isInGrace,
        graceEndsAt: entitlements.graceEndsAt,
      },
      capabilities: {
        isSoloWorkspace: entitlements.isSoloWorkspace,
      },
    };
  },
});
