import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import {
  action,
  type ActionCtx,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from './_generated/server';
import { getWorkOS } from './auth';

type AuthIdentity = NonNullable<Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>>;
type MaybeAuthIdentity = Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>;

function assertAuthIdentity(identity: MaybeAuthIdentity): asserts identity is AuthIdentity {
  if (!identity) {
    throwAppErrorForConvex(ErrorCode.AUTH_UNAUTHORIZED, { reason: 'no_identity' });
  }
}

function assertUser(user: Doc<'users'> | null, authId: string): asserts user is Doc<'users'> {
  if (!user) {
    throwAppErrorForConvex(ErrorCode.AUTH_USER_NOT_FOUND, { authId });
  }
}

function assertCreatedUser(user: Doc<'users'> | null): asserts user is Doc<'users'> {
  if (!user) {
    throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, { details: 'Failed to fetch created user' });
  }
}

/**
 * Gets the authenticated user's identity from the JWT token.
 * Use this for simple auth checks when you don't need the full DB user.
 */
async function getAuthIdentity(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<AuthIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  assertAuthIdentity(identity);
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

  assertUser(user, identity.subject);
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
    const workosUser = await (async (): Promise<
      Awaited<ReturnType<typeof workos.userManagement.getUser>>
    > => {
      try {
        return await workos.userManagement.getUser(authId);
      } catch (error) {
        const workosError = error as { status?: number; message?: string };

        if (
          workosError.status === 404 ||
          workosError.message?.toLowerCase().includes('not found')
        ) {
          throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_USER_NOT_FOUND, { authId });
        }
        if (workosError.status === 429) {
          throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_RATE_LIMIT);
        }
        throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
          operation: 'getUser',
          status: workosError.status,
          message: workosError.message,
        });
      }
      throw new Error('Unhandled WorkOS user fetch error');
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
 *
 * @param authId - The WorkOS auth ID of the user to delete.
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
    });
    const newUser = await ctx.db.get('users', id);
    assertCreatedUser(newUser);
    return newUser;
  },
});
