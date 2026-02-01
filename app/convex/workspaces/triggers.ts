import { triggers } from '../functions';

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
