import type { Id } from '../_generated/dataModel';
import { DEFAULT_PLAN_KEY } from '../entitlements/service';
import type { MutationCtx } from '../functions';
import { logger } from '../logging';

/**
 * Ensures a workspace billing state row exists, inserting a free default if missing.
 */
export async function upsertWorkspaceBillingState(ctx: MutationCtx, workspaceId: Id<'workspaces'>) {
  const existing = await ctx.db
    .query('workspaceBillingState')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .unique();

  if (existing) {
    return existing._id;
  }

  const billingStateId = await ctx.db.insert('workspaceBillingState', {
    workspaceId,
    planKey: DEFAULT_PLAN_KEY,
    status: 'none',
    updatedAt: Date.now(),
  });

  logger.info({
    event: 'billing.workspace_state.created_default',
    category: 'BILLING',
    context: {
      workspaceId,
      billingStateId,
      planKey: DEFAULT_PLAN_KEY,
      status: 'none',
    },
  });

  return billingStateId;
}
