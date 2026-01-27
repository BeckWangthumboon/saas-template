import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { getWorkOS } from './auth';
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

type AuthIdentity = NonNullable<Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>>;

function assertCreatedUser(user: Doc<'users'> | null): asserts user is Doc<'users'> {
  if (!user) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Failed to fetch created user',
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
export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx): Promise<Doc<'users'>> {
  const identity = await getAuthIdentity(ctx);

  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();

  if (!user) {
    return throwAppErrorForConvex(ErrorCode.AUTH_USER_NOT_FOUND, { authId: identity.subject });
  }
  return user;
}

/**
 * Gets the current user if authenticated, otherwise returns null.
 * Safe to call without authentication - will not throw.
 *
 * @returns The user document if authenticated and exists, null otherwise.
 */
export const getUserOrNull = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
      .unique();

    return user ?? null;
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
  handler: async (ctx): Promise<Doc<'users'>> => {
    const identity = await getAuthIdentity(ctx);
    const authId = identity.subject;
    const existingUser = await ctx.runQuery(internal.user.getUserByAuthIdInternal, { authId });

    if (existingUser) {
      return existingUser;
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
    return await ctx.runMutation(internal.user.getUserOrUpsertInternal, {
      authId,
      userData: {
        email: workosUser.email,
        firstName: workosUser.firstName ?? undefined,
        lastName: workosUser.lastName ?? undefined,
        profilePictureUrl: workosUser.profilePictureUrl ?? undefined,
      },
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

    const ownerMemberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .filter((q) => q.eq(q.field('role'), 'owner'))
      .collect();

    const soleOwnerWorkspaceNames: string[] = [];
    for (const membership of ownerMemberships) {
      const workspaceOwners = await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', membership.workspaceId))
        .filter((q) => q.eq(q.field('role'), 'owner'))
        .collect();

      if (workspaceOwners.length === 1) {
        const workspace = await ctx.db.get('workspaces', membership.workspaceId);
        if (workspace) {
          soleOwnerWorkspaceNames.push(workspace.name);
        }
      }
    }

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

    const id = await ctx.db.insert('users', {
      authId: args.authId,
      ...args.userData,
      onboardingStatus: 'not_started',
      updatedAt: Date.now(),
    });
    const newUser = await ctx.db.get('users', id);
    assertCreatedUser(newUser);
    return newUser;
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
  if (change.operation !== 'delete') {
    return;
  }

  const memberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_userId', (q) => q.eq('userId', change.id))
    .collect();

  for (const membership of memberships) {
    await ctx.db.delete('workspaceMembers', membership._id);
  }
});
