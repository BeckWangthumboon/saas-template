import type { RunId } from '@convex-dev/action-retrier';
import type { Infer } from 'convex/values';
import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  action,
  type ActionCtx,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
  triggers,
} from './functions';
import type { userDeleteInfo } from './schema';
import { workosActionRetrier, type WorkosUserFetchResult, workosWorkpool } from './workos';
import { getSoleOwnerWorkspaceForUser } from './workspaceOwnership';

const PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DELETE_MAX_ATTEMPTS = 5;
const DELETE_BACKOFF_SCHEDULE_MS = [
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];
const WORKOS_FETCH_POLL_INTERVAL_MS = 500;
const WORKOS_FETCH_MAX_WAIT_MS = 10_000;

type AuthIdentity = NonNullable<Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>>;
type ActiveUser = Extract<Doc<'users'>, { status: 'active' }>;
type UserDeleteInfo = Infer<typeof userDeleteInfo>;
type DeletingUser = Extract<Doc<'users'>, { status: 'deleting' }> & { delete: UserDeleteInfo };
type DeletionFailedUser = Extract<Doc<'users'>, { status: 'deletion_failed' }> & {
  delete: UserDeleteInfo;
};

const isDeletingUser = (user: Doc<'users'>): user is DeletingUser => user.status === 'deleting';
const isDeletingOrFailedUser = (user: Doc<'users'>): user is DeletingUser | DeletionFailedUser =>
  user.status === 'deleting' || user.status === 'deletion_failed';

/**
 * Computes the next retry timestamp based on attempt count and a base time.
 */
const getDeleteNextAttemptAt = (attempts: number, baseTime: number) =>
  baseTime +
  DELETE_BACKOFF_SCHEDULE_MS[Math.min(attempts - 1, DELETE_BACKOFF_SCHEDULE_MS.length - 1)];

/**
 * Derives retry counters and the next attempt time for a deleting user.
 */
const getDeleteAttemptInfo = (user: DeletingUser) => {
  const deleteInfo = user.delete;
  const attempts = deleteInfo.attempts ?? 1;
  const lastAttemptAt = deleteInfo.lastAttemptAt ?? user.deletingAt;
  const nextAttemptAt = deleteInfo.nextAttemptAt ?? getDeleteNextAttemptAt(attempts, lastAttemptAt);
  return { attempts, lastAttemptAt, nextAttemptAt };
};

/**
 * Narrow a user document to an active user (status + required fields).
 */
export const isActiveUser = (user: Doc<'users'>): user is ActiveUser =>
  user.status === 'active' &&
  Boolean(user.authId) &&
  Boolean(user.email) &&
  user.authId.trim().length > 0 &&
  user.email.trim().length > 0;

/**
 * Asserts a user is active, otherwise throws a structured error.
 */
const assertActiveUser = (
  user: Doc<'users'>,
  error: { code: ErrorCode; details?: Record<string, unknown> },
): ActiveUser => {
  if (user.status !== 'active') {
    return throwAppErrorForConvex(error.code, error.details ?? {});
  }
  if (
    !user.authId ||
    !user.email ||
    user.authId.trim().length === 0 ||
    user.email.trim().length === 0
  ) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'User authId or email is missing',
    });
  }
  return user;
};

/**
 * Pause execution for polling delays.
 *
 * @param ms - Delay duration in milliseconds.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validates the shape of a WorkOS fetch result returned by the Action Retrier.
 *
 * @param value - The return value to validate.
 * @returns True if the value matches WorkosUserFetchResult.
 */
const isWorkosUserFetchResult = (value: unknown): value is WorkosUserFetchResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'not_found') {
    return true;
  }
  if (kind !== 'user') {
    return false;
  }
  const userData = (value as { userData?: unknown }).userData;
  if (!userData || typeof userData !== 'object') {
    return false;
  }
  const email = (userData as { email?: unknown }).email;
  return typeof email === 'string' && email.trim().length > 0;
};

/**
 * Waits for a WorkOS fetch retrier run to complete or times out.
 *
 * @param ctx - The action context.
 * @param runId - The Action Retrier run ID.
 * @returns The normalized WorkOS fetch result.
 * @throws Error if the run fails, is canceled, or times out.
 */
const waitForWorkosFetchResult = async (
  ctx: ActionCtx,
  runId: RunId,
): Promise<WorkosUserFetchResult> => {
  const startTime = Date.now();

  while (Date.now() - startTime < WORKOS_FETCH_MAX_WAIT_MS) {
    const status = await workosActionRetrier.status(ctx, runId);
    if (status.type === 'completed') {
      try {
        if (status.result.type === 'success') {
          if (!isWorkosUserFetchResult(status.result.returnValue)) {
            return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
              details: 'Invalid WorkOS fetch result shape',
            });
          }
          return status.result.returnValue;
        }
        if (status.result.type === 'failed') {
          return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
            operation: 'getUser',
            message: status.result.error,
          });
        }
        return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
          operation: 'getUser',
          message: 'WorkOS fetch canceled',
        });
      } finally {
        try {
          await workosActionRetrier.cleanup(ctx, runId);
        } catch {
          // if already completed, ignore.
        }
      }
    }

    await sleep(WORKOS_FETCH_POLL_INTERVAL_MS);
  }

  try {
    await workosActionRetrier.cancel(ctx, runId);
  } catch {
    // if already completed, ignore.
  }

  return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
    operation: 'getUser',
    message: 'WorkOS fetch timed out',
  });
};

/**
 * Revokes all pending invites where the user is the invitee (recipient).
 *
 * @param ctx - The Convex mutation context
 * @param userId - The ID of the user to revoke invites for
 * @param email - The email of the user to revoke invites for
 */
async function revokePendingInvitesForUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
  email: string | undefined,
) {
  const invitesForUser = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_invitedUserId', (q) => q.eq('invitedUserId', userId))
    .collect();

  const normalizedEmail = email?.toLowerCase().trim();
  const invitesForEmail = normalizedEmail
    ? await ctx.db
        .query('workspaceInvites')
        .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
        .collect()
    : [];

  const inviteMap = new Map(
    [...invitesForUser, ...invitesForEmail].map((invite) => [invite._id, invite]),
  );
  const now = Date.now();

  for (const invite of inviteMap.values()) {
    if (invite.status !== 'pending') {
      continue;
    }
    await ctx.db.patch('workspaceInvites', invite._id, {
      status: 'revoked',
      updatedAt: now,
    });
  }
}

/**
 * Gets the authenticated user's identity from the JWT token.
 * Use this for simple auth checks when you don't need the full DB user.
 */
async function getAuthIdentity(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<AuthIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return throwAppErrorForConvex(ErrorCode.AUTH_UNAUTHORIZED, { reason: 'no_identity' });
  }
  return identity;
}

/**
 * Gets the authenticated user from the database.
 * Use this when you need the full user document with all fields.
 */
export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await getAuthIdentity(ctx);

  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();

  if (!user) {
    return throwAppErrorForConvex(ErrorCode.AUTH_USER_NOT_FOUND, { authId: identity.subject });
  }

  return assertActiveUser(user, {
    code: ErrorCode.AUTH_USER_DELETING,
    details: { authId: identity.subject, userId: user._id },
  });
}

/**
 * Gets a user by authId if they exist and are active.
 *
 * @param ctx - Query context
 * @param authId - The WorkOS auth ID to look up
 * @returns The user document if found and active, null otherwise
 */
export const getUserByAuthId = async (
  ctx: QueryCtx,
  authId: string,
): Promise<ActiveUser | null> => {
  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', authId))
    .unique();
  if (!user) {
    return null;
  }
  if (!isActiveUser(user)) {
    return null;
  }
  return user;
};

/**
 * Returns the user document for the given user ID if the user exists and is active.
 *
 * @param ctx - The query context.
 * @param userId - The ID of the user to look up.
 * @returns The active user document if found, otherwise null.
 */
export const getActiveUserById = async (ctx: QueryCtx, userId: Id<'users'>) => {
  const user = await ctx.db
    .query('users')
    .withIndex('by_id', (q) => q.eq('_id', userId))
    .unique();
  if (!user || !isActiveUser(user)) {
    return null;
  }
  return user;
};

/**
 * Returns the user document for the given email if the user exists and is active.
 *
 * @param ctx - The query or mutation context.
 * @param email - The email to look up.
 * @returns The active user document if found, otherwise null.
 */
export const getActiveUserByEmail = async (ctx: QueryCtx | MutationCtx, email: string) => {
  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique();
  if (!user || !isActiveUser(user)) {
    return null;
  }
  return user;
};

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
    const existingUser = await ctx.runQuery(internal.user.getUserByAuthIdInternal, { authId });

    if (existingUser) {
      return assertActiveUser(existingUser, {
        code: ErrorCode.AUTH_USER_DELETING,
        details: { authId, userId: existingUser._id },
      });
    }

    const runId = await workosActionRetrier.run(ctx, internal.workos.fetchWorkosUser, { authId });
    const workosResult = await waitForWorkosFetchResult(ctx, runId);

    if (workosResult.kind === 'not_found') {
      return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_USER_NOT_FOUND, { authId });
    }

    const newUser = await ctx.runMutation(internal.user.getUserOrUpsertInternal, {
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
    const identiy = await getAuthIdentity(ctx);
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', identiy.subject))
      .unique();

    if (!user) {
      return throwAppErrorForConvex(ErrorCode.AUTH_USER_NOT_FOUND, { authId: identiy.subject });
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

    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete('workspaceMembers', membership._id);
    }

    await revokePendingInvitesForUser(ctx, user._id, user.email);

    const now = Date.now();
    const workId = await workosWorkpool.enqueueAction(
      ctx,
      internal.workos.deleteWorkosUser,
      {
        authId: identiy.subject,
      },
      {
        onComplete: internal.user.deleteAccountOnComplete,
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
 * Finalizes account deletion after the WorkOS delete action completes.
 * Marks the user as deleted on success, or records the failure to allow retries.
 */
export const deleteAccountOnComplete = workosWorkpool.defineOnComplete({
  context: v.object({ userId: v.id('users') }),
  handler: async (ctx, args) => {
    const { result, context } = args;
    const { userId } = context;
    const user = (await ctx.db.get('users', userId)) as Doc<'users'> | null;
    if (!user) {
      return;
    }
    if (result.kind === 'success') {
      const now = Date.now();
      await ctx.db.patch('users', userId, {
        status: 'deleted',
        deletedAt: now,
        purgeAt: now + PURGE_DELAY_MS,
        authId: undefined,
        email: undefined,
        firstName: undefined,
        lastName: undefined,
        profilePictureUrl: undefined,
        deletingAt: undefined,
        delete: undefined,
      });
      return;
    }

    if (!isDeletingOrFailedUser(user)) {
      return;
    }

    const deleteInfo = user.delete;
    await ctx.db.patch('users', userId, {
      delete: {
        attempts: deleteInfo.attempts,
        lastAttemptAt: deleteInfo.lastAttemptAt,
        nextAttemptAt: deleteInfo.nextAttemptAt,
        workId: deleteInfo.workId,
        lastError: `WorkOS delete failed (${result.kind})`,
      },
    });
  },
});

/**
 * Reconciles stuck user deletions by re-enqueuing WorkOS delete.
 * Called daily by cron job.
 *
 * Finds users with status='deleting' that are due for retry, and re-enqueues
 * the WorkOS delete action via Workpool.
 *
 */
export const reconcileStuckUserDeletions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const deletingUsers = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'deleting'))
      .collect();

    let requeuedCount = 0;
    let terminalCount = 0;

    for (const user of deletingUsers) {
      if (!isDeletingUser(user)) {
        continue;
      }

      const deleteInfo = user.delete;
      const { attempts, lastAttemptAt, nextAttemptAt } = getDeleteAttemptInfo(user);

      if (!user.authId) {
        await ctx.db.patch('users', user._id, {
          status: 'deletion_failed',
          delete: {
            attempts,
            lastAttemptAt,
            nextAttemptAt,
            workId: deleteInfo.workId,
            lastError: deleteInfo.lastError ?? 'Missing authId for WorkOS delete',
          },
        });
        terminalCount += 1;
        continue;
      }

      if (attempts >= DELETE_MAX_ATTEMPTS) {
        await ctx.db.patch('users', user._id, {
          status: 'deletion_failed',
          delete: {
            attempts,
            lastAttemptAt,
            nextAttemptAt,
            workId: deleteInfo.workId,
            lastError: deleteInfo.lastError ?? 'Max delete attempts reached',
          },
        });
        terminalCount += 1;
        continue;
      }

      if (nextAttemptAt > now) {
        continue;
      }

      const newAttempts = attempts + 1;
      const workId = await workosWorkpool.enqueueAction(
        ctx,
        internal.workos.deleteWorkosUser,
        { authId: user.authId },
        {
          onComplete: internal.user.deleteAccountOnComplete,
          context: { userId: user._id },
          retry: true,
        },
      );

      await ctx.db.patch('users', user._id, {
        delete: {
          attempts: newAttempts,
          lastAttemptAt: now,
          nextAttemptAt: getDeleteNextAttemptAt(newAttempts, now),
          workId,
          lastError: deleteInfo.lastError,
        },
      });

      requeuedCount += 1;
    }

    return { reconciledCount: requeuedCount, terminalCount };
  },
});

/**
 * Purges user tombstones whose purgeAt has passed.
 * Called daily by cron job.
 *
 * @internal
 */
export const purgeDeletedUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredUsers = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'deleted'))
      .filter((q) => q.lt(q.field('purgeAt'), now))
      .collect();

    for (const user of expiredUsers) {
      await ctx.db.delete('users', user._id);
    }

    return { purgedCount: expiredUsers.length };
  },
});

/**
 * Internal query to fetch a user by their auth ID.
 *
 * @param authId - The WorkOS auth ID to look up.
 * @returns The user document if found, null otherwise.
 * @internal
 */
export const getUserByAuthIdInternal = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', args.authId))
      .unique();
    return user;
  },
});

/**
 * Internal mutation to delete a user by their auth ID.
 * Does nothing if the user does not exist.
 * Validates that the user is not the sole owner of any workspace.
 *
 * @param authId - The WorkOS auth ID of the user to delete.
 * @throws USER_LAST_OWNER_OF_WORKSPACE if user is the only owner of any workspace.
 * @internal
 */
export const deleteUserByAuthId = internalMutation({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', args.authId))
      .unique();

    if (!user) {
      return;
    }

    const soleOwnerWorkspace = await getSoleOwnerWorkspaceForUser(ctx, user._id);

    if (soleOwnerWorkspace.length > 0) {
      return throwAppErrorForConvex(ErrorCode.USER_LAST_OWNER_OF_WORKSPACE, {
        workspaceNames: soleOwnerWorkspace.map((workspace) => workspace.name),
      });
    }

    await ctx.db.delete('users', user._id);
  },
});

/**
 * Removes all workspace memberships and revokes pending invites for a user.
 * Used when cleaning up a user during deletion.
 *
 * @param ctx - The mutation context
 * @param userId - The ID of the user to clean up
 * @param email - The email of the user (for invite lookups)
 */
export async function cleanupUserForDeletion(
  ctx: MutationCtx,
  userId: Id<'users'>,
  email: string | undefined,
) {
  const memberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .collect();

  for (const membership of memberships) {
    await ctx.db.delete('workspaceMembers', membership._id);
  }

  await revokePendingInvitesForUser(ctx, userId, email);
}

/**
 * Marks a user as deleted, clearing all PII.
 * Used when a user is deleted from WorkOS.
 *
 * @param ctx - The mutation context
 * @param userId - The ID of the user to mark as deleted
 */
export async function markUserAsDeleted(ctx: MutationCtx, userId: Id<'users'>) {
  const now = Date.now();
  await ctx.db.patch('users', userId, {
    status: 'deleted',
    deletedAt: now,
    purgeAt: now + PURGE_DELAY_MS,
    authId: undefined,
    email: undefined,
    firstName: undefined,
    lastName: undefined,
    profilePictureUrl: undefined,
  });
}

/**
 * Handles user deletion from WorkOS.
 * Cleans up local user data when a user is deleted externally.
 * Idempotent - safe to call multiple times.
 *
 * @param ctx - The mutation context
 * @param authId - The WorkOS auth ID of the deleted user
 */
export async function handleUserDeleted(ctx: MutationCtx, authId: string) {
  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', authId))
    .unique();

  if (!user) {
    return;
  }

  if (
    user.status === 'deleted' ||
    user.status === 'deleting' ||
    user.status === 'deletion_failed'
  ) {
    return;
  }

  await cleanupUserForDeletion(ctx, user._id, user.email);
  await markUserAsDeleted(ctx, user._id);
}

/**
 * Internal mutation to get an existing user or create one from provided data.
 * Used during the user provisioning flow after WorkOS authentication.
 *
 * @param authId - The WorkOS auth ID.
 * @param userData - User data to insert if the user doesn't exist.
 * @returns The existing or newly created user document.
 * @internal
 */
export const getUserOrUpsertInternal = internalMutation({
  args: {
    authId: v.string(),
    userData: v.object({
      email: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      profilePictureUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<Doc<'users'>> => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', args.authId))
      .unique();

    if (existingUser) {
      return existingUser;
    }

    const userId = await ctx.db.insert('users', {
      authId: args.authId,
      email: args.userData.email,
      firstName: args.userData.firstName ?? undefined,
      lastName: args.userData.lastName ?? undefined,
      profilePictureUrl: args.userData.profilePictureUrl ?? undefined,
      onboardingStatus: 'not_started',
      updatedAt: Date.now(),
      status: 'active',
    });

    const user = await getActiveUserById(ctx, userId);
    if (!user) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Failed to fetch created user',
      });
    }
    return user;
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

triggers.register('users', async (ctx, change) => {
  if (change.operation === 'delete') {
    await cleanupUserForDeletion(ctx, change.id, change.oldDoc.email);
    return;
  }

  const user = change.newDoc;
  if (user.status === 'deleted' && change.oldDoc?.status !== 'deleted') {
    await revokePendingInvitesForUser(ctx, user._id, change.oldDoc?.email);
  }

  if (
    user.status === 'active' &&
    (!user.authId ||
      !user.email ||
      user.authId.trim().length === 0 ||
      user.email.trim().length === 0)
  ) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Active users must have authId and email',
    });
  }

  if (
    user.status === 'deleted' &&
    (user.authId !== undefined ||
      user.email !== undefined ||
      user.firstName !== undefined ||
      user.lastName !== undefined ||
      user.profilePictureUrl !== undefined)
  ) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Deleted users cannot retain PII',
    });
  }
});
