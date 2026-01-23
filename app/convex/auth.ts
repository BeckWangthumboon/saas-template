import { type AuthFunctions, AuthKit } from '@convex-dev/workos-authkit';
import { WorkOS } from '@workos-inc/node';

import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

/**
 * Creates a WorkOS client instance.
 * Use this factory function to get a properly configured WorkOS client.
 */
export function getWorkOS(): WorkOS {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error('WORKOS_API_KEY environment variable is not set');
  }
  return new WorkOS(apiKey);
}

const authFunctions: AuthFunctions = internal.auth;

const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
});

export const { authKitEvent } = authKit.events({
  /**
   * Handles 'user.created' event from WorkOS.
   * Updates missing user fields if the user exists, or inserts a new user. (idempotent)
   *
   * @param ctx - Event context
   * @param event - WorkOS user event
   */
  'user.created': async (ctx, event) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();

    if (existingUser) {
      const updates: Record<string, string> = {};
      if (!existingUser.firstName && event.data.firstName) {
        updates.firstName = event.data.firstName;
      }
      if (!existingUser.lastName && event.data.lastName) {
        updates.lastName = event.data.lastName;
      }
      if (!existingUser.profilePictureUrl && event.data.profilePictureUrl) {
        updates.profilePictureUrl = event.data.profilePictureUrl;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch('users', existingUser._id, updates);
      }
      return;
    }

    await ctx.db.insert('users', {
      authId: event.data.id,
      email: event.data.email,
      firstName: event.data.firstName ?? undefined,
      lastName: event.data.lastName ?? undefined,
      profilePictureUrl: event.data.profilePictureUrl ?? undefined,
    });
  },
  /**
   * Handles 'user.updated' events from WorkOS.
   * Updates the user's email and profile picture URL
   *
   * @param ctx - Event context
   * @param event - WorkOS user event
   */
  'user.updated': async (ctx, event) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();
    if (!user) {
      return;
    }
    await ctx.db.patch('users', user._id, {
      email: event.data.email,
      profilePictureUrl: event.data.profilePictureUrl ?? undefined,
    });
  },
  /**
   * Handles 'user.deleted' events from WorkOS.
   * Deletes the user from the database.
   *
   * @param ctx - Event context
   * @param event - WorkOS user event
   */
  'user.deleted': async (ctx, event) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();
    if (!user) {
      return;
    }
    await ctx.db.delete('users', user._id);
  },
});

export { authKit };
