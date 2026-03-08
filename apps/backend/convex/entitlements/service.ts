import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../functions';
import { logger } from '../logging';
import type { BillingStatus, PlanKey, PlanTier, WorkspaceUsage } from './types';

export interface WorkspaceAccountDeletionEligibility {
  isSingleOwnerSingleMember: boolean;
  hasBillableLifecycle: boolean;
  canAutoDeleteOnAccountDeletion: boolean;
}

export const DEFAULT_PLAN_KEY: PlanKey = 'free';

const BILLABLE_LIFECYCLE_STATUSES = new Set<BillingStatus>(['trialing', 'active', 'past_due']);

/**
 * Resolves plan tier from plan key.
 */
export const getPlanTier = (planKey: PlanKey): PlanTier => {
  return planKey === 'free' ? 'free' : 'pro';
};

/**
 * Returns whether a billing status should be treated as billable for destructive actions.
 */
export const isBillableLifecycleStatus = (
  status: BillingStatus,
): status is 'trialing' | 'active' | 'past_due' => {
  return BILLABLE_LIFECYCLE_STATUSES.has(status);
};

/**
 * Computes current workspace usage counters from Convex data.
 *
 * The snapshot includes active members, active owners, and pending non-expired invites.
 */
export async function getWorkspaceUsageSnapshot(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  now = Date.now(),
): Promise<WorkspaceUsage> {
  const memberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .collect();

  const users = await Promise.all(
    memberships.map((membership) => ctx.db.get('users', membership.userId)),
  );

  let memberCount = 0;
  let ownerCount = 0;

  for (const [index, membership] of memberships.entries()) {
    const user = users[index];
    if (user?.status !== 'active') {
      continue;
    }

    memberCount += 1;
    if (membership.role === 'owner') {
      ownerCount += 1;
    }
  }

  const pendingInviteCount = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .filter((q) => q.and(q.eq(q.field('status'), 'pending'), q.gte(q.field('expiresAt'), now)))
    .collect()
    .then((invites) => invites.length);

  const usageSnapshot = {
    memberCount,
    ownerCount,
    pendingInviteCount,
  };

  logger.debug({
    event: 'billing.entitlements.usage_snapshot_computed',
    category: 'BILLING',
    context: {
      workspaceId,
      memberCount: usageSnapshot.memberCount,
      ownerCount: usageSnapshot.ownerCount,
      pendingInviteCount: usageSnapshot.pendingInviteCount,
    },
  });

  return usageSnapshot;
}

/**
 * Resolves whether a workspace can be auto-deleted as part of account deletion.
 *
 * Auto-delete is only allowed when exactly one active owner/member remains and
 * the workspace is not currently in a billable lifecycle state.
 */
export const resolveWorkspaceAccountDeletionEligibility = (input: {
  usage: WorkspaceUsage;
  status: BillingStatus;
}): WorkspaceAccountDeletionEligibility => {
  const isSingleOwnerSingleMember = input.usage.memberCount === 1 && input.usage.ownerCount === 1;
  const hasBillableLifecycle = isBillableLifecycleStatus(input.status);

  return {
    isSingleOwnerSingleMember,
    hasBillableLifecycle,
    canAutoDeleteOnAccountDeletion: isSingleOwnerSingleMember && !hasBillableLifecycle,
  };
};
