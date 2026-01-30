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
import { getWorkOS, workosWorkpool } from './workos';
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
 * Creates the user from WorkOS API data if they don't exist.
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

    const workos = getWorkOS();
    const workosUser = await (async () => {
      try {
        return await workos.userManagement.getUser(authId);
      } catch (error) {
        const workosError = error as { status?: number; message?: string };

        if (
          workosError.status === 404 ||
          workosError.message?.toLowerCase().includes('not found')
        ) {
          return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_USER_NOT_FOUND, { authId });
        }
        if (workosError.status === 429) {
          return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_RATE_LIMIT);
        }
        return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
          operation: 'getUser',
          status: workosError.status,
          message: workosError.message,
        });
      }
    })();
    const newUser = await ctx.runMutation(internal.user.getUserOrUpsertInternal, {
      authId,
      userData: {
        email: workosUser.email,
        firstName: workosUser.firstName ?? undefined,
        lastName: workosUser.lastName ?? undefined,
        profilePictureUrl: workosUser.profilePictureUrl ?? undefined,
      },
    });
    return assertActiveUser(newUser, {
      code: ErrorCode.AUTH_USER_DELETING,
      details: { authId, userId: newUser._id },
    });
  },
});

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
