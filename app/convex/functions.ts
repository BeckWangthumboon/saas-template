import { customCtx, customMutation } from 'convex-helpers/server/customFunctions';
import { Triggers } from 'convex-helpers/server/triggers';

import type { DataModel } from './_generated/dataModel';
import {
  action,
  type ActionCtx,
  internalMutation as rawInternalMutation,
  internalQuery,
  mutation as rawMutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from './_generated/server';

const triggers = new Triggers<DataModel>();

triggers.register('workspaces', async (ctx, change) => {
  if (change.operation !== 'delete') {
    return;
  }

  const members = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', change.id))
    .collect();

  for (const member of members) {
    await ctx.db.delete('workspaceMembers', member._id);
  }

  const invites = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', change.id))
    .collect();

  for (const invite of invites) {
    await ctx.db.delete('workspaceInvites', invite._id);
  }
});

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

export { action, internalQuery, query };
export type { ActionCtx, MutationCtx, QueryCtx };
