import { v } from 'convex/values';

import { ErrorCode } from '../../shared/errors';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import { convexEnv } from '../env';
import { throwAppErrorForConvex } from '../errors';
import { internalMutation, type MutationCtx } from '../functions';
import { logger } from '../logging';

const RESET_CONFIRMATION_TOKEN = 'RESET_DEV_DATA';
const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_EXPIRATION_MS = 7 * DAY_MS;

const DEMO_WORKSPACE_NAMES = {
  solo: '[Demo] Solo Workspace',
  teamPro: '[Demo] Pro Team Workspace',
  billingIssue: '[Demo] Past Due Workspace',
} as const;

const DEMO_OWNER_FALLBACK = {
  authId: 'dev_demo_owner_auth',
  email: 'dev-owner@example.com',
  firstName: 'Dev',
  lastName: 'Owner',
} as const;

const DEMO_ADMIN_USER = {
  authId: 'dev_demo_admin_auth',
  email: 'dev-admin@example.com',
  firstName: 'Dev',
  lastName: 'Admin',
} as const;

const DEMO_MEMBER_USER = {
  authId: 'dev_demo_member_auth',
  email: 'dev-member@example.com',
  firstName: 'Dev',
  lastName: 'Member',
} as const;

const DEMO_PENDING_INVITE = {
  email: 'pending-invite@example.com',
  role: 'member' as const,
  token: 'demo-pro-team-pending-invite',
} as const;

type TableName = keyof DataModel;
type ActiveUser = Extract<Doc<'users'>, { status: 'active' }>;
type WorkspaceRole = Doc<'workspaceMembers'>['role'];
type BillingPlanKey = Doc<'workspaceBillingState'>['planKey'];
type BillingStatus = Doc<'workspaceBillingState'>['status'];

interface DemoUserSpec {
  authId: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface WorkspaceSeedInput {
  name: string;
  owner: ActiveUser;
  now: number;
}

interface BillingSeedInput {
  workspaceId: Id<'workspaces'>;
  planKey: BillingPlanKey;
  status: BillingStatus;
  now: number;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerSubscriptionUpdatedAt?: number;
  pastDueAt?: number;
}

/**
 * Returns true when the provided user document is active.
 */
const isActiveUser = (user: Doc<'users'>): user is ActiveUser => user.status === 'active';

/**
 * Normalizes an email string for deterministic comparisons.
 *
 * @param email - Raw email input.
 * @returns Lowercased and trimmed email.
 */
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Builds a display name from user profile fields.
 *
 * @param user - Active user with optional name fields.
 * @returns Human-readable display name fallback.
 */
const getUserDisplayName = (user: ActiveUser): string => {
  const fullName = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(' ').trim();
  if (fullName.length > 0) {
    return fullName;
  }
  return user.email;
};

/**
 * Ensures a function can run only in the dev app environment.
 *
 * @param operation - Operation name for logging and error context.
 * @throws INTERNAL_ERROR when APP_ENV is not `dev`.
 */
const assertDevEnvironment = (operation: 'seedDemoData' | 'resetDevData'): void => {
  if (convexEnv.appEnv === 'dev') {
    return;
  }

  logger.warn({
    event: 'dev.data.operation_blocked',
    category: 'INTERNAL',
    context: {
      operation,
      appEnv: convexEnv.appEnv,
      reason: 'non_dev_environment',
    },
  });

  return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
    details: `${operation} is dev-only. Set APP_ENV=dev to run this operation.`,
  });
};

/**
 * Loads an active user by ID or throws if the record is missing/inactive.
 *
 * @param ctx - Convex mutation context.
 * @param userId - User ID to load.
 * @returns Active user document.
 * @throws INTERNAL_ERROR when user is missing or not active.
 */
const requireActiveUserById = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<ActiveUser> => {
  const user = await ctx.db.get('users', userId);
  if (!user || !isActiveUser(user)) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: `Expected active user for seed operation (${userId})`,
    });
  }
  return user;
};

/**
 * Upserts a deterministic demo user by auth ID/email.
 *
 * @param ctx - Convex mutation context.
 * @param spec - Demo user seed specification.
 * @param now - Current timestamp.
 * @returns ID of the ensured user and whether a write occurred.
 */
const ensureDemoUser = async (
  ctx: MutationCtx,
  spec: DemoUserSpec,
  now: number,
): Promise<{ userId: Id<'users'>; changed: boolean }> => {
  const normalizedEmail = normalizeEmail(spec.email);

  const [existingByEmail, existingByAuthId] = await Promise.all([
    ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
      .unique(),
    ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', spec.authId))
      .unique(),
  ]);

  if (existingByEmail && existingByAuthId && existingByEmail._id !== existingByAuthId._id) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: `Demo seed conflict: email/authId map to different users (${spec.email})`,
    });
  }

  const existingUser = existingByEmail ?? existingByAuthId;
  if (!existingUser) {
    const userId = await ctx.db.insert('users', {
      status: 'active',
      authId: spec.authId,
      email: normalizedEmail,
      firstName: spec.firstName,
      lastName: spec.lastName,
      onboardingStatus: 'completed',
      updatedAt: now,
    });
    return { userId, changed: true };
  }

  const shouldPatch =
    existingUser.status !== 'active' ||
    existingUser.authId !== spec.authId ||
    existingUser.email !== normalizedEmail ||
    existingUser.firstName !== spec.firstName ||
    existingUser.lastName !== spec.lastName ||
    existingUser.onboardingStatus !== 'completed';

  if (!shouldPatch) {
    return { userId: existingUser._id, changed: false };
  }

  await ctx.db.patch('users', existingUser._id, {
    status: 'active',
    authId: spec.authId,
    email: normalizedEmail,
    firstName: spec.firstName,
    lastName: spec.lastName,
    onboardingStatus: 'completed',
    updatedAt: now,
    profilePictureUrl: undefined,
  });

  return { userId: existingUser._id, changed: true };
};

/**
 * Ensures a workspace exists with deterministic metadata.
 *
 * @param ctx - Convex mutation context.
 * @param input - Workspace seed input.
 * @returns Workspace ID and whether a write occurred.
 */
const ensureWorkspace = async (
  ctx: MutationCtx,
  input: WorkspaceSeedInput,
): Promise<{ workspaceId: Id<'workspaces'>; changed: boolean }> => {
  const matches = await ctx.db
    .query('workspaces')
    .withIndex('by_name', (q) => q.eq('name', input.name))
    .collect();

  if (matches.length === 0) {
    const workspaceId = await ctx.db.insert('workspaces', {
      name: input.name,
      createdByUserId: input.owner._id,
      creatorDisplayEmailSnapshot: input.owner.email,
      creatorDisplayNameSnapshot: getUserDisplayName(input.owner),
      updatedAt: input.now,
      status: 'active',
      deletedAt: undefined,
      purgeAt: undefined,
      deletedByUserId: undefined,
    });
    return { workspaceId, changed: true };
  }

  const activeMatch = matches.find((workspace) => workspace.status !== 'deleted');
  const existingWorkspace =
    activeMatch ?? [...matches].sort((a, b) => a._creationTime - b._creationTime)[0];

  const nextFields = {
    name: input.name,
    createdByUserId: input.owner._id,
    creatorDisplayEmailSnapshot: input.owner.email,
    creatorDisplayNameSnapshot: getUserDisplayName(input.owner),
    updatedAt: input.now,
    status: 'active' as const,
    deletedAt: undefined,
    purgeAt: undefined,
    deletedByUserId: undefined,
  };

  const shouldPatch =
    existingWorkspace.status === 'deleted' ||
    existingWorkspace.createdByUserId !== input.owner._id ||
    existingWorkspace.creatorDisplayEmailSnapshot !== input.owner.email ||
    existingWorkspace.creatorDisplayNameSnapshot !== getUserDisplayName(input.owner);

  if (!shouldPatch) {
    return { workspaceId: existingWorkspace._id, changed: false };
  }

  await ctx.db.patch('workspaces', existingWorkspace._id, nextFields);
  return { workspaceId: existingWorkspace._id, changed: true };
};

/**
 * Ensures a workspace membership with the requested role.
 *
 * @param ctx - Convex mutation context.
 * @param workspaceId - Target workspace.
 * @param userId - Target user.
 * @param role - Desired membership role.
 * @param now - Current timestamp.
 * @returns True when a write occurred.
 */
const ensureWorkspaceMembership = async (
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
  role: WorkspaceRole,
  now: number,
): Promise<boolean> => {
  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_userId', (q) =>
      q.eq('workspaceId', workspaceId).eq('userId', userId),
    )
    .unique();

  if (!membership) {
    await ctx.db.insert('workspaceMembers', {
      workspaceId,
      userId,
      role,
      updatedAt: now,
    });
    return true;
  }

  if (membership.role === role) {
    return false;
  }

  await ctx.db.patch('workspaceMembers', membership._id, {
    role,
    updatedAt: now,
  });
  return true;
};

/**
 * Ensures deterministic billing state for a workspace.
 *
 * @param ctx - Convex mutation context.
 * @param input - Billing seed data.
 * @returns True when a write occurred.
 */
const ensureWorkspaceBillingState = async (
  ctx: MutationCtx,
  input: BillingSeedInput,
): Promise<boolean> => {
  const existing = await ctx.db
    .query('workspaceBillingState')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', input.workspaceId))
    .unique();

  const nextFields = {
    workspaceId: input.workspaceId,
    planKey: input.planKey,
    status: input.status,
    periodEnd: input.periodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    providerCustomerId: input.providerCustomerId,
    providerSubscriptionId: input.providerSubscriptionId,
    providerSubscriptionUpdatedAt: input.providerSubscriptionUpdatedAt,
    pastDueAt: input.pastDueAt,
    updatedAt: input.now,
  };

  if (!existing) {
    await ctx.db.insert('workspaceBillingState', nextFields);
    return true;
  }

  await ctx.db.patch('workspaceBillingState', existing._id, nextFields);
  return true;
};

/**
 * Ensures one pending invite exists for the demo team workspace.
 *
 * @param ctx - Convex mutation context.
 * @param workspaceId - Workspace where the invite should exist.
 * @param invitedByUserId - User creating the invite.
 * @param invitedByUser - Active user profile for inviter snapshots.
 * @param now - Current timestamp.
 * @returns Number of writes performed.
 */
const ensurePendingInvite = async (
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  invitedByUserId: Id<'users'>,
  invitedByUser: ActiveUser,
  now: number,
): Promise<number> => {
  const invites = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId_email', (q) =>
      q.eq('workspaceId', workspaceId).eq('email', DEMO_PENDING_INVITE.email),
    )
    .collect();

  const pendingInvites = invites.filter((invite) => invite.status === 'pending');
  const extraPendingInvites = pendingInvites.slice(1);
  let writes = 0;

  for (const invite of extraPendingInvites) {
    await ctx.db.patch('workspaceInvites', invite._id, {
      status: 'revoked',
      updatedAt: now,
    });
    writes += 1;
  }

  const nextFields = {
    workspaceId,
    email: DEMO_PENDING_INVITE.email,
    role: DEMO_PENDING_INVITE.role,
    token: DEMO_PENDING_INVITE.token,
    status: 'pending' as const,
    invitedByUserId,
    invitedUserId: undefined,
    expiresAt: now + INVITE_EXPIRATION_MS,
    acceptedByUserId: undefined,
    acceptedAt: undefined,
    updatedAt: now,
    inviterDisplayNameSnapshot: getUserDisplayName(invitedByUser),
    inviterDisplayEmailSnapshot: invitedByUser.email,
  };

  if (pendingInvites.length === 0) {
    await ctx.db.insert('workspaceInvites', nextFields);
    return writes + 1;
  }

  const targetPendingInvite = pendingInvites[0];
  await ctx.db.patch('workspaceInvites', targetPendingInvite._id, nextFields);
  return writes + 1;
};

/**
 * Deletes all documents from a given table.
 *
 * @param ctx - Convex mutation context.
 * @param tableName - Table to clear.
 * @returns Number of deleted documents.
 */
const deleteAllDocumentsFromTable = async (
  ctx: MutationCtx,
  tableName: TableName,
): Promise<number> => {
  const documents = await ctx.db.query(tableName).collect();
  for (const document of documents) {
    await ctx.db.delete(tableName, document._id);
  }
  return documents.length;
};

/**
 * Seeds deterministic demo data for local development.
 *
 * This operation is available only when `APP_ENV=dev`.
 */
export const seedDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDevEnvironment('seedDemoData');

    const now = Date.now();
    const usersByStatus = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .collect();
    const sortedActiveUsers = usersByStatus
      .filter(isActiveUser)
      .sort((a, b) => a._creationTime - b._creationTime);

    const fallbackOwnerResult =
      sortedActiveUsers.length === 0
        ? await ensureDemoUser(ctx, DEMO_OWNER_FALLBACK, now)
        : { userId: sortedActiveUsers[0]._id, changed: false };

    const owner =
      sortedActiveUsers.length > 0
        ? sortedActiveUsers[0]
        : await requireActiveUserById(ctx, fallbackOwnerResult.userId);

    const [adminResult, memberResult] = await Promise.all([
      ensureDemoUser(ctx, DEMO_ADMIN_USER, now),
      ensureDemoUser(ctx, DEMO_MEMBER_USER, now),
    ]);

    const adminUser = await requireActiveUserById(ctx, adminResult.userId);
    const memberUser = await requireActiveUserById(ctx, memberResult.userId);

    const [soloWorkspaceResult, teamWorkspaceResult, billingIssueWorkspaceResult] =
      await Promise.all([
        ensureWorkspace(ctx, { name: DEMO_WORKSPACE_NAMES.solo, owner, now }),
        ensureWorkspace(ctx, { name: DEMO_WORKSPACE_NAMES.teamPro, owner, now }),
        ensureWorkspace(ctx, { name: DEMO_WORKSPACE_NAMES.billingIssue, owner, now }),
      ]);

    const workspaceMembershipWrites = await Promise.all([
      ensureWorkspaceMembership(ctx, soloWorkspaceResult.workspaceId, owner._id, 'owner', now),
      ensureWorkspaceMembership(ctx, teamWorkspaceResult.workspaceId, owner._id, 'owner', now),
      ensureWorkspaceMembership(ctx, teamWorkspaceResult.workspaceId, adminUser._id, 'admin', now),
      ensureWorkspaceMembership(
        ctx,
        teamWorkspaceResult.workspaceId,
        memberUser._id,
        'member',
        now,
      ),
      ensureWorkspaceMembership(
        ctx,
        billingIssueWorkspaceResult.workspaceId,
        owner._id,
        'owner',
        now,
      ),
    ]);

    const billingWrites = await Promise.all([
      ensureWorkspaceBillingState(ctx, {
        workspaceId: soloWorkspaceResult.workspaceId,
        planKey: 'free',
        status: 'none',
        now,
      }),
      ensureWorkspaceBillingState(ctx, {
        workspaceId: teamWorkspaceResult.workspaceId,
        planKey: 'pro_monthly',
        status: 'active',
        periodEnd: now + 30 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerCustomerId: 'demo_customer_pro_team',
        providerSubscriptionId: 'demo_subscription_pro_team',
        providerSubscriptionUpdatedAt: now,
        now,
      }),
      ensureWorkspaceBillingState(ctx, {
        workspaceId: billingIssueWorkspaceResult.workspaceId,
        planKey: 'pro_monthly',
        status: 'past_due',
        periodEnd: now + 10 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerCustomerId: 'demo_customer_past_due',
        providerSubscriptionId: 'demo_subscription_past_due',
        providerSubscriptionUpdatedAt: now,
        pastDueAt: now - 2 * DAY_MS,
        now,
      }),
    ]);

    const inviteWrites = await ensurePendingInvite(
      ctx,
      teamWorkspaceResult.workspaceId,
      owner._id,
      owner,
      now,
    );

    const summary = {
      usersChanged:
        Number(fallbackOwnerResult.changed) +
        Number(adminResult.changed) +
        Number(memberResult.changed),
      workspacesChanged:
        Number(soloWorkspaceResult.changed) +
        Number(teamWorkspaceResult.changed) +
        Number(billingIssueWorkspaceResult.changed),
      membershipsChanged: workspaceMembershipWrites.filter(Boolean).length,
      billingStatesChanged: billingWrites.filter(Boolean).length,
      invitesChanged: inviteWrites,
      ownerUserId: owner._id,
      workspaceIds: {
        solo: soloWorkspaceResult.workspaceId,
        teamPro: teamWorkspaceResult.workspaceId,
        billingIssue: billingIssueWorkspaceResult.workspaceId,
      },
    };

    logger.info({
      event: 'dev.data.seeded',
      category: 'INTERNAL',
      context: {
        appEnv: convexEnv.appEnv,
        ...summary,
      },
    });

    return summary;
  },
});

/**
 * Resets local development data by clearing app tables.
 *
 * This operation is available only when `APP_ENV=dev` and requires an explicit
 * confirmation token.
 */
export const resetDevData = internalMutation({
  args: {
    confirm: v.string(),
    includeUsers: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDevEnvironment('resetDevData');

    if (args.confirm !== RESET_CONFIRMATION_TOKEN) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: `Invalid reset confirmation token. Expected '${RESET_CONFIRMATION_TOKEN}'.`,
      });
    }

    const includeUsers = args.includeUsers ?? false;
    const tableOrder: TableName[] = [
      'billingEvents',
      'workspaceInvites',
      'workspaceMembers',
      'workspaceBillingState',
      'workspaces',
      ...(includeUsers ? (['users'] as const) : []),
    ];

    const deletedCounts: Partial<Record<TableName, number>> = {};

    for (const tableName of tableOrder) {
      deletedCounts[tableName] = await deleteAllDocumentsFromTable(ctx, tableName);
    }

    logger.warn({
      event: 'dev.data.reset_completed',
      category: 'INTERNAL',
      context: {
        appEnv: convexEnv.appEnv,
        includeUsers,
        deletedCounts,
      },
    });

    return {
      includeUsers,
      deletedCounts,
    };
  },
});
