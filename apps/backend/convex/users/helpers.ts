import type { RunId } from '@convex-dev/action-retrier';
import { ErrorCode } from '@saas/shared/errors';
import type { Infer } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';
import type { ActionCtx, MutationCtx, QueryCtx } from '../functions';
import type { userDeleteInfo } from '../schema';
import { deleteR2ObjectOrDefer } from '../storage/deletes';
import { getR2SignedUrl } from '../storage/r2Client';
import { workosActionRetrier, type WorkosUserFetchResult } from './workos';

export const PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const DELETE_MAX_ATTEMPTS = 5;
const DELETE_BACKOFF_SCHEDULE_MS = [
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];
const WORKOS_FETCH_POLL_INTERVAL_MS = 500;
const WORKOS_FETCH_MAX_WAIT_MS = 10_000;
const AVATAR_URL_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days

type AuthIdentity = NonNullable<Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>>;
export type ActiveUser = Extract<Doc<'users'>, { status: 'active' }>;
type UserDeleteInfo = Infer<typeof userDeleteInfo>;
type DeletingUser = Extract<Doc<'users'>, { status: 'deleting' }> & { delete: UserDeleteInfo };
type DeletionFailedUser = Extract<Doc<'users'>, { status: 'deletion_failed' }> & {
  delete: UserDeleteInfo;
};

/**
 * Checks whether a user is in the deleting state.
 */
export const isDeletingUser = (user: Doc<'users'>): user is DeletingUser =>
  user.status === 'deleting';

/**
 * Checks whether a user is deleting or deletion failed.
 */
export const isDeletingOrFailedUser = (
  user: Doc<'users'>,
): user is DeletingUser | DeletionFailedUser =>
  user.status === 'deleting' || user.status === 'deletion_failed';

/**
 * Computes the next retry timestamp based on attempt count and a base time.
 */
export const getDeleteNextAttemptAt = (attempts: number, baseTime: number) =>
  baseTime +
  DELETE_BACKOFF_SCHEDULE_MS[Math.min(attempts - 1, DELETE_BACKOFF_SCHEDULE_MS.length - 1)];

/**
 * Derives retry counters and the next attempt time for a deleting user.
 */
export const getDeleteAttemptInfo = (user: DeletingUser) => {
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
export const assertActiveUser = (
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
export const waitForWorkosFetchResult = async (
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
export async function revokePendingInvitesForUser(
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
export async function getAuthIdentity(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<AuthIdentity> {
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
 * Resolves the avatar URL returned to clients.
 * Custom avatars are stored by R2 object key and must be converted to a signed URL on read.
 */
export const resolveUserProfilePictureUrl = async (
  user: Pick<
    ActiveUser,
    'avatarKey' | 'avatarSource' | 'profilePictureUrl' | 'workosProfilePictureUrl'
  >,
) => {
  if (user.avatarSource === 'custom' && user.avatarKey) {
    return getR2SignedUrl(user.avatarKey, AVATAR_URL_EXPIRES_IN_SECONDS);
  }

  return user.profilePictureUrl ?? user.workosProfilePictureUrl ?? undefined;
};

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
  const user = await ctx.db.get('users', userId);
  const customAvatarKey =
    user?.status === 'active' || user?.status === 'deleting' || user?.status === 'deletion_failed'
      ? user.avatarSource === 'custom'
        ? user.avatarKey
        : undefined
      : undefined;

  if (customAvatarKey) {
    await deleteR2ObjectOrDefer(ctx, {
      key: customAvatarKey,
      source: 'auth.avatar.user_delete_cleanup_failed',
      reason: 'user_marked_deleted',
    });
  }

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
    workosProfilePictureUrl: undefined,
    avatarSource: undefined,
    avatarKey: undefined,
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
