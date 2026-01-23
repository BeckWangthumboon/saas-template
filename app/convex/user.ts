import type { WorkOS } from '@workos-inc/node';
import { v } from 'convex/values';

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

/**
 * Gets the authenticated user's identity from the JWT token.
 * Use this for simple auth checks when you don't need the full DB user.
 */
async function getAuthIdentity(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error('Unauthorized');
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
    throw new Error('User not found');
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
  handler: async (ctx): Promise<Doc<'users'> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthorized');
    }

    const authId = identity.subject;
    const existingUser = await ctx.runQuery(internal.user.getUserByAuthIdInternal, { authId });

    if (existingUser) {
      return existingUser;
    }

    const workos = getWorkOS();
    let workosUser: Awaited<ReturnType<WorkOS['userManagement']['getUser']>>;

    try {
      workosUser = await workos.userManagement.getUser(authId);
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message = (error as { message?: string }).message;
      if (status === 404 || message?.toLowerCase().includes('not found')) {
        return null;
      }
      throw error;
    }

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
    await workos.userManagement.deleteUser(identity.subject);
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
    if (!newUser) throw new Error('Failed to fetch created user');
    return newUser;
  },
});
