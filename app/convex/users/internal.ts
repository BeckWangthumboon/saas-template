import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';
import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import { internalMutation, internalQuery } from '../functions';
import {
  DELETE_MAX_ATTEMPTS,
  getActiveUserById,
  getDeleteAttemptInfo,
  getDeleteNextAttemptAt,
  isDeletingOrFailedUser,
  isDeletingUser,
  PURGE_DELAY_MS,
} from './helpers';
import { workosWorkpool } from './workos';

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
        internal.users.workos.deleteWorkosUser,
        { authId: user.authId },
        {
          onComplete: internal.users.internal.deleteAccountOnComplete,
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
