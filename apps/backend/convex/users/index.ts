import './triggers';

import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import {
  getWorkspaceUsageSnapshot,
  isBillableLifecycleStatus,
  resolveWorkspaceAccountDeletionEligibility,
} from '../entitlements/service';
import { throwAppErrorForConvex } from '../errors';
import { action, mutation, query } from '../functions';
import { logger } from '../logging';
import { tombstoneWorkspace } from '../workspaces/helpers';
import { getSoleOwnerWorkspaceForUser } from '../workspaces/utils';
import {
  type ActiveUser,
  assertActiveUser,
  cleanupUserForDeletion,
  getAuthenticatedUser,
  getAuthIdentity,
  getDeleteNextAttemptAt,
  isActiveUser,
  waitForWorkosFetchResult,
} from './helpers';
import { workosActionRetrier, workosWorkpool } from './workos';

/**
 * Gets the current user if authenticated, otherwise returns null.
 * Safe to call without authentication - will not throw.
 *
 * @returns The user document if authenticated and exists, null otherwise.
 */
export const getUserOrNull = query({
  args: {},
  handler: async (ctx): Promise<ActiveUser | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
      .unique();

    if (!user || !isActiveUser(user)) {
      return null;
    }
    return user;
  },
});

/**
 * Gets the authenticated user's onboarding status.
 *
 * @returns 'not_started' if not completed, 'completed' if completed.
 * @throws Error if not authenticated or user not found.
 */
export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    return user.onboardingStatus;
  },
});

/**
 * Updates the authenticated user's first and/or last name.
 *
 * @param firstName - The new first name (optional).
 * @param lastName - The new last name (optional).
 * @throws Error if the user is not authenticated or not found.
 */
export const updateName = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const nextFirstName = args.firstName;
    const nextLastName = args.lastName;
    const currentFirstName = user.firstName ?? undefined;
    const currentLastName = user.lastName ?? undefined;

    if (nextFirstName === currentFirstName && nextLastName === currentLastName) {
      return;
    }

    await ctx.db.patch('users', user._id, {
      firstName: nextFirstName,
      lastName: nextLastName,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Ensures the authenticated user exists in the database.
 * Creates the user from WorkOS API data if they don't exist, with retries.
 * Run when authenticated route is mounted.
 */
export const ensureUser = action({
  args: {},
  handler: async (ctx): Promise<ActiveUser> => {
    const identity = await getAuthIdentity(ctx);
    const authId = identity.subject;
    const existingUser = await ctx.runQuery(internal.users.internal.getUserByAuthIdInternal, {
      authId,
    });

    if (existingUser) {
      logger.debug({
        event: 'auth.user.ensure_existing',
        category: 'AUTH',
        context: {
          userId: existingUser._id,
          authId,
        },
      });

      return assertActiveUser(existingUser, {
        code: ErrorCode.AUTH_USER_DELETING,
        details: { authId, userId: existingUser._id },
      });
    }

    const runId = await workosActionRetrier.run(ctx, internal.users.workos.fetchWorkosUser, {
      authId,
    });
    const workosResult = await waitForWorkosFetchResult(ctx, runId);

    if (workosResult.kind === 'not_found') {
      return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_USER_NOT_FOUND, { authId });
    }

    const newUser = await ctx.runMutation(internal.users.internal.getUserOrUpsertInternal, {
      authId,
      userData: {
        email: workosResult.userData.email,
        firstName: workosResult.userData.firstName ?? undefined,
        lastName: workosResult.userData.lastName ?? undefined,
        profilePictureUrl: workosResult.userData.profilePictureUrl ?? undefined,
      },
    });

    logger.info({
      event: 'auth.user.provisioned',
      category: 'AUTH',
      context: {
        userId: newUser._id,
        authId,
      },
    });

    return assertActiveUser(newUser, {
      code: ErrorCode.AUTH_USER_DELETING,
      details: { authId, userId: newUser._id },
    });
  },
});

/**
 * Requests account deletion for the authenticated user.
 * Cleans up memberships and pending invites, then enqueues the WorkOS delete action.
 * Automatically tombstones eligible sole-owned workspaces when they are non-billable and
 * have exactly one active owner/member.
 *
 * No-ops if the user is already deleting or deleted.
 *
 * @throws USER_LAST_OWNER_OF_WORKSPACE when the user is the sole owner of a non-solo workspace.
 * @throws BILLING_ACCOUNT_DELETE_BLOCKED when any sole-owned workspace is still billable.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
      .unique();

    if (!user) {
      return throwAppErrorForConvex(ErrorCode.AUTH_USER_NOT_FOUND, { authId: identity.subject });
    }
    if (
      user.status === 'deleting' ||
      user.status === 'deleted' ||
      user.status === 'deletion_failed'
    ) {
      logger.debug({
        event: 'auth.user.delete_ignored',
        category: 'AUTH',
        context: {
          userId: user._id,
          status: user.status,
        },
      });

      return;
    }

    const soleOwnerWorkspaces = await getSoleOwnerWorkspaceForUser(ctx, user._id);
    const checksByWorkspace = await Promise.all(
      soleOwnerWorkspaces.map(async (workspace) => {
        const [usage, billingState] = await Promise.all([
          getWorkspaceUsageSnapshot(ctx, workspace._id),
          ctx.db
            .query('workspaceBillingState')
            .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspace._id))
            .unique(),
        ]);

        if (!billingState) {
          return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_STATE_MISSING, {
            workspaceId: workspace._id,
          });
        }

        const deletionEligibility = resolveWorkspaceAccountDeletionEligibility({
          usage,
          status: billingState.status,
        });

        return {
          workspace,
          deletionEligibility,
          billingStatus: billingState.status,
        };
      }),
    );
    const ownershipBlockedWorkspaces = checksByWorkspace.filter(
      ({ deletionEligibility }) => !deletionEligibility.isSingleOwnerSingleMember,
    );

    if (ownershipBlockedWorkspaces.length > 0) {
      logger.warn({
        event: 'auth.user.delete_blocked',
        category: 'AUTH',
        context: {
          userId: user._id,
          reason: 'last_owner_workspace',
          workspaceNames: ownershipBlockedWorkspaces.map(({ workspace }) => workspace.name),
        },
      });

      return throwAppErrorForConvex(ErrorCode.USER_LAST_OWNER_OF_WORKSPACE, {
        workspaceNames: ownershipBlockedWorkspaces.map(({ workspace }) => workspace.name),
      });
    }

    const billingBlockedWorkspaces = checksByWorkspace.filter(
      ({ deletionEligibility }) => deletionEligibility.hasBillableLifecycle,
    );

    if (billingBlockedWorkspaces.length > 0) {
      const billableStatuses = billingBlockedWorkspaces
        .map(({ billingStatus }) => billingStatus)
        .filter(isBillableLifecycleStatus);

      logger.warn({
        event: 'auth.user.delete_blocked',
        category: 'AUTH',
        context: {
          userId: user._id,
          reason: 'billing_active',
          workspaceNames: billingBlockedWorkspaces.map(({ workspace }) => workspace.name),
          statuses: billableStatuses,
        },
      });

      return throwAppErrorForConvex(ErrorCode.BILLING_ACCOUNT_DELETE_BLOCKED, {
        workspaceNames: billingBlockedWorkspaces.map(({ workspace }) => workspace.name),
        statuses: billableStatuses,
      });
    }

    let autoDeletedWorkspaceCount = 0;

    for (const { workspace, deletionEligibility } of checksByWorkspace) {
      if (!deletionEligibility.canAutoDeleteOnAccountDeletion) {
        continue;
      }

      await tombstoneWorkspace(ctx, workspace._id, user._id);
      autoDeletedWorkspaceCount += 1;
    }

    logger.info({
      event: 'auth.user.delete_requested',
      category: 'AUTH',
      context: {
        userId: user._id,
        soleOwnerWorkspaceCount: checksByWorkspace.length,
        autoDeletedWorkspaceCount,
      },
    });

    await cleanupUserForDeletion(ctx, user._id, user.email);

    const now = Date.now();
    const workId = await workosWorkpool.enqueueAction(
      ctx,
      internal.users.workos.deleteWorkosUser,
      {
        authId: identity.subject,
      },
      {
        onComplete: internal.users.internal.deleteAccountOnComplete,
        context: { userId: user._id },
        retry: true,
      },
    );

    await ctx.db.patch('users', user._id, {
      status: 'deleting',
      deletingAt: now,
      delete: {
        attempts: 1,
        lastAttemptAt: now,
        nextAttemptAt: getDeleteNextAttemptAt(1, now),
        lastError: undefined,
        workId,
      },
    });

    logger.info({
      event: 'auth.user.delete_enqueued',
      category: 'AUTH',
      context: {
        userId: user._id,
      },
    });
  },
});

/**
 * Marks the authenticated user's onboarding as completed.
 *
 * @throws Error if not authenticated.
 */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ctx.db.patch('users', user._id, {
      onboardingStatus: 'completed',
      updatedAt: Date.now(),
    });

    logger.info({
      event: 'auth.user.onboarding_completed',
      category: 'AUTH',
      context: {
        userId: user._id,
      },
    });
  },
});
