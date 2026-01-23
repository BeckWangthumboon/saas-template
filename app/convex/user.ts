import { WorkOS } from '@workos-inc/node';
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

/**
 * Creates a WorkOS client instance.
 * Use this factory function to get a properly configured WorkOS client.
 */
function getWorkOS(): WorkOS {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error('WORKOS_API_KEY environment variable is not set');
  }
  return new WorkOS(apiKey);
}

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

export const getUser = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthenticatedUser(ctx);
  },
});

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

export const deleteAccount = action({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);

    const workos = getWorkOS();
    await workos.userManagement.deleteUser(identity.subject);
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
    const workosUser = await workos.userManagement.getUser(authId);

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
 * Get user object by authId
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
 * Get user object or create from provided data
 * Returns the user document (existing or newly created)
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
