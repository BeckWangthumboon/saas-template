import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../functions';
import { DEFAULT_PLAN_KEY } from './entitlements';

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

  return await ctx.db.insert('workspaceBillingState', {
    workspaceId,
    planKey: DEFAULT_PLAN_KEY,
    status: 'none',
    updatedAt: Date.now(),
  });
}
