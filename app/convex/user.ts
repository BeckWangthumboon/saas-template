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
import { getWorkOS, workosWorkpool } from './workos';
import { getSoleOwnerWorkspaceForUser } from './workspaceOwnership';

const PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type AuthIdentity = NonNullable<Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>>;
type ActiveUser = Extract<Doc<'users'>, { status: 'active' }>;

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
    if (user.status === 'deleting' || user.status === 'deleted') {
      return;
    }

    const soleOwnerWorkspace = await getSoleOwnerWorkspaceForUser(ctx, user._id);
    if (soleOwnerWorkspace.length > 0) {
      return throwAppErrorForConvex(ErrorCode.USER_LAST_OWNER_OF_WORKSPACE, {
        workspaceNames: soleOwnerWorkspace.map((workspace) => workspace.name),
      });
    }

    await ctx.db.patch('users', user._id, {
      status: 'deleting',
      deletingAt: Date.now(),
    });

    await workosWorkpool.enqueueAction(
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
  },
});

export const deleteAccountOnComplete = workosWorkpool.defineOnComplete({
  context: v.object({ userId: v.id('users') }),
  handler: async (ctx, args) => {
    const { result, context } = args;
    const { userId } = context;
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
      });
    }
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
    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_userId', (q) => q.eq('userId', change.id))
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete('workspaceMembers', membership._id);
    }
    await revokePendingInvitesForUser(ctx, change.id, change.oldDoc.email);
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
