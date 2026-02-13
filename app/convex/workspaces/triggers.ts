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

  const contacts = await ctx.db
    .query('contacts')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', change.id))
    .collect();

  for (const contact of contacts) {
    await ctx.db.delete('contacts', contact._id);
  }

  const billingState = await ctx.db
    .query('workspaceBillingState')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', change.id))
    .unique();

  if (billingState) {
    await ctx.db.delete('workspaceBillingState', billingState._id);
  }
});
