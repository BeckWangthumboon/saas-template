import { v } from 'convex/values';

import { query } from '../functions';
import { getWorkspaceMembership } from '../workspaces/utils';
import { getWorkspaceUsageSnapshot } from './service';
import { workspaceEntitlementsSummaryValidator } from './types';

/**
 * Returns local workspace usage for UI display and app-side decisions.
 *
 * @param workspaceId - The workspace to read entitlement data for.
 * @returns Workspace usage snapshot derived from Convex data.
 * @throws WORKSPACE_ACCESS_DENIED if the caller is not a workspace member.
 */
export const getWorkspaceEntitlements = query({
  args: { workspaceId: v.id('workspaces') },
  returns: workspaceEntitlementsSummaryValidator,
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);
    const usage = await getWorkspaceUsageSnapshot(ctx, args.workspaceId);

    return {
      workspaceId: args.workspaceId,
      usage,
    };
  },
});
