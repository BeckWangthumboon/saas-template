import './triggers';

import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';
import { internal } from '../_generated/api';
import { action, mutation, query } from '../functions';
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
    await ctx.db.patch('users', user._id, {
      firstName: args.firstName,
      lastName: args.lastName,
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
    return assertActiveUser(newUser, {
      code: ErrorCode.AUTH_USER_DELETING,
      details: { authId, userId: newUser._id },
    });
  },
});

/**
 * Requests account deletion for the authenticated user.
 * Cleans up memberships and pending invites, then enqueues the WorkOS delete action.
 *
 * No-ops if the user is already deleting or deleted.
 *
 * @throws USER_LAST_OWNER_OF_WORKSPACE when the user is the sole owner of any workspace.
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
      return;
    }

    const soleOwnerWorkspace = await getSoleOwnerWorkspaceForUser(ctx, user._id);
    if (soleOwnerWorkspace.length > 0) {
      return throwAppErrorForConvex(ErrorCode.USER_LAST_OWNER_OF_WORKSPACE, {
        workspaceNames: soleOwnerWorkspace.map((workspace) => workspace.name),
      });
    }

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
  },
});
