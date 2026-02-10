import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../functions';
import type {
  BillingStatus,
  PlanFeatures,
  PlanKey,
  PlanLimits,
  PlanTier,
  WorkspaceUsage,
} from './types';

export type FeatureKey = keyof PlanFeatures;
export type LimitKey = keyof PlanLimits;
export type BillingInterval = 'month' | 'year';

export interface PlanDefinition {
  features: PlanFeatures;
  limits: PlanLimits;
  billingInterval: BillingInterval | null;
}

export interface WorkspaceEntitlementsSnapshot {
  effectivePlanKey: PlanKey;
  features: PlanFeatures;
  limits: PlanLimits;
  usage: WorkspaceUsage;
  effectiveStatus: BillingStatus;
  isLocked: boolean;
  isInGrace: boolean;
  graceEndsAt: number | undefined;
  isSoloWorkspace: boolean;
}

interface ResolveWorkspaceEntitlementsInput {
  planKey: PlanKey;
  status: BillingStatus;
  pastDueAt: number | undefined;
  usage: WorkspaceUsage;
  now: number;
}

interface ResolveBillingLifecycleInput {
  status: BillingStatus;
  pastDueAt: number | undefined;
  now: number;
}

export interface BillingLifecycle {
  effectiveStatus: BillingStatus;
  isLocked: boolean;
  isInGrace: boolean;
  graceEndsAt: number | undefined;
}

const PRO_FEATURES = {
  team_members: true,
} as const satisfies PlanFeatures;

const PRO_LIMITS = {
  members: 50,
  invites: null,
  workspaces: null,
} as const satisfies PlanLimits;

export const PLAN_CATALOG = {
  free: {
    features: {
      team_members: false,
    },
    limits: {
      members: 1,
      invites: 0,
      workspaces: 1,
    },
    billingInterval: null,
  },
  pro_monthly: {
    features: PRO_FEATURES,
    limits: PRO_LIMITS,
    billingInterval: 'month',
  },
  pro_yearly: {
    features: PRO_FEATURES,
    limits: PRO_LIMITS,
    billingInterval: 'year',
  },
} as const satisfies Record<PlanKey, PlanDefinition>;

export const DEFAULT_PLAN_KEY: PlanKey = 'free';
export const PAST_DUE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns the catalog entry for a given plan key.
 */
export const getPlanDefinition = (planKey: PlanKey): PlanDefinition => {
  return PLAN_CATALOG[planKey];
};

/**
 * Resolves plan tier from plan key.
 */
export const getPlanTier = (planKey: PlanKey): PlanTier => {
  return planKey === 'free' ? 'free' : 'pro';
};

/**
 * Returns plan features and limits from the plan catalog.
 */
export const getPlanEntitlements = (planKey: PlanKey) => {
  const { features, limits, billingInterval } = getPlanDefinition(planKey);
  return { features, limits, billingInterval };
};

/**
 * Resolves the effective plan key used for entitlement enforcement.
 * Persisted billing status remains unchanged for audit purposes.
 */
export const resolveEffectivePlanKey = (planKey: PlanKey, status: BillingStatus): PlanKey => {
  if (status === 'canceled') {
    return 'free';
  }
  return planKey;
};

/**
 * Resolves billing lifecycle flags from raw provider status.
 */
export const resolveBillingLifecycle = (input: ResolveBillingLifecycleInput): BillingLifecycle => {
  const graceEndsAt = input.pastDueAt ? input.pastDueAt + PAST_DUE_GRACE_PERIOD_MS : undefined;
  const isInGrace =
    input.status === 'past_due' && graceEndsAt !== undefined && input.now < graceEndsAt;
  const effectiveStatus = input.status === 'past_due' && isInGrace ? 'active' : input.status;
  const isLocked = input.status === 'past_due' && !isInGrace;

  return {
    effectiveStatus,
    isLocked,
    isInGrace,
    graceEndsAt,
  };
};

/**
 * Computes current workspace usage counters used by entitlement enforcement.
 *
 * The snapshot includes active members, active owners, and pending non-expired invites.
 *
 * @param ctx - Convex query or mutation context used for database reads.
 * @param workspaceId - Workspace identifier to compute usage for.
 * @param now - Current timestamp in milliseconds used to filter expired invites.
 * @returns Usage snapshot for current workspace membership and invite state.
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

  return {
    memberCount,
    ownerCount,
    pendingInviteCount,
  };
}

/**
 * Resolves a workspace entitlement snapshot from billing state and usage metrics.
 */
export const resolveWorkspaceEntitlements = (
  input: ResolveWorkspaceEntitlementsInput,
): WorkspaceEntitlementsSnapshot => {
  const lifecycle = resolveBillingLifecycle({
    status: input.status,
    pastDueAt: input.pastDueAt,
    now: input.now,
  });

  const effectivePlanKey = resolveEffectivePlanKey(input.planKey, input.status);
  const { features, limits } = getPlanEntitlements(effectivePlanKey);

  const isSoloWorkspace =
    effectivePlanKey === 'free' && input.usage.memberCount === 1 && input.usage.ownerCount === 1;

  return {
    effectivePlanKey,
    features,
    limits,
    usage: input.usage,
    effectiveStatus: lifecycle.effectiveStatus,
    isLocked: lifecycle.isLocked,
    isInGrace: lifecycle.isInGrace,
    graceEndsAt: lifecycle.graceEndsAt,
    isSoloWorkspace,
  };
};

/**
 * Loads workspace billing state and resolves the current entitlement snapshot.
 *
 * @param ctx - Convex query or mutation context used for database access.
 * @param workspaceId - Workspace identifier to resolve entitlements for.
 * @param now - Current timestamp in milliseconds for grace and expiration checks.
 * @returns Current billing state plus resolved workspace entitlement snapshot.
 * @throws BILLING_WORKSPACE_STATE_MISSING when no billing state exists for the workspace.
 */
export async function getWorkspaceEntitlementsSnapshot(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  now = Date.now(),
) {
  const state = await ctx.db
    .query('workspaceBillingState')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .unique();

  if (!state) {
    return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_STATE_MISSING, {
      workspaceId,
    });
  }

  const usage = await getWorkspaceUsageSnapshot(ctx, workspaceId, now);
  const entitlements = resolveWorkspaceEntitlements({
    planKey: state.planKey,
    status: state.status,
    pastDueAt: state.pastDueAt,
    usage,
    now,
  });

  return {
    state,
    entitlements,
  };
}
