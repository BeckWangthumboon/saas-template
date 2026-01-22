import { type AuthFunctions,AuthKit } from '@convex-dev/workos-authkit';

import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

const authFunctions: AuthFunctions = internal.auth;

const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
}); 

export const { authKitEvent } = authKit.events({
  'user.created': async (ctx, event) => {
    const userData = {
      authId: event.data.id,
      email: event.data.email,
      name: event.data.firstName ?? undefined,
    };
    await ctx.db.insert('users', userData);
  },
  'user.updated': async (ctx, event) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();
    if (!user) {
      console.warn(`User not found: ${event.data.id}`);
      return;
    }
    await ctx.db.patch('users', user._id, {
      email: event.data.email,
      name: event.data.firstName ?? undefined,
    });
  },
  'user.deleted': async (ctx, event) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();
    if (!user) {
      console.warn(`User not found: ${event.data.id}`);
      return;
    }
    await ctx.db.delete('users', user._id);
  },
});

export { authKit };
