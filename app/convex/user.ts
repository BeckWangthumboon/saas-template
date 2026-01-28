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
import { getSoleOwnerWorkspaceNamesForUser } from './workspaceOwnership';

type AuthIdentity = NonNullable<Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>>;
type ActiveUser = Extract<Doc<'users'>, { status: 'active' }>;

/**
 * Narrow a user document to an active user (status + required fields).
 */
const isActiveUser = (user: Doc<'users'>): user is ActiveUser =>
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

export const getUserById = async (
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<ActiveUser | null> => {
  const user = await ctx.db
    .query('users')
    .withIndex('by_id', (q) => q.eq('_id', userId))
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
        code: ErrorCode.AUTH_USER_NOT_FOUND,
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
      code: ErrorCode.AUTH_USER_NOT_FOUND,
      details: { authId, userId: newUser._id },
    });
  },
});

/**
 * Permanently deletes the authenticated user's account.
 * Removes the user from the Convex database and then from WorkOS.
 * If WorkOS deletion fails (e.g., user already deleted), the operation
 * still succeeds since the Convex user has been removed.
 *
 * @throws Error if the user is not authenticated.
 */
export const deleteAccount = action({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);

    await ctx.runMutation(internal.user.deleteUserByAuthId, {
      authId: identity.subject,
    });

    const workos = getWorkOS();
    try {
      await workos.userManagement.deleteUser(identity.subject);
    } catch (error) {
      const workosError = error as { status?: number; message?: string };
      if (workosError.status === 404) {
        return;
      }
      console.error('Failed to delete user from WorkOS:', workosError);
    }
  },
});

export const newDeleteAccount = mutation({
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

    const soleOwnerWorkspaceNames = await getSoleOwnerWorkspaceNamesForUser(ctx, user._id);
    if (soleOwnerWorkspaceNames.length > 0) {
      return throwAppErrorForConvex(ErrorCode.USER_LAST_OWNER_OF_WORKSPACE, {
        workspaceNames: soleOwnerWorkspaceNames,
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
        onComplete: internal.user.newDeleteAccountOnComplete,
        context: { userId: user._id },
        retry: true,
      },
    );
  },
});

export const newDeleteAccountOnComplete = workosWorkpool.defineOnComplete({
  context: v.object({ userId: v.id('users') }),
  handler: async (ctx, args) => {
    const { result, context } = args;
    const { userId } = context;
    if (result.kind === 'success') {
      await ctx.db.patch('users', userId, {
        status: 'deleted',
        deletedAt: Date.now(),
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

    const soleOwnerWorkspaceNames = await getSoleOwnerWorkspaceNamesForUser(ctx, user._id);

    if (soleOwnerWorkspaceNames.length > 0) {
      return throwAppErrorForConvex(ErrorCode.USER_LAST_OWNER_OF_WORKSPACE, {
        workspaceNames: soleOwnerWorkspaceNames,
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

    const user = await getUserById(ctx, userId);
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
    return;
  }

  const user = change.newDoc;

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
