import { WorkOS } from '@workos-inc/node';
import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import {
  action,
  type ActionCtx,
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
