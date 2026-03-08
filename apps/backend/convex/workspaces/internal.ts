import './triggers';

import { v } from 'convex/values';

import { internalMutation, internalQuery } from '../functions';
import { logger } from '../logging';

export const getWorkspaceKeyById = internalQuery({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get('workspaces', args.workspaceId);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    return workspace.workspaceKey;
  },
});

export const getWorkspaceBillingEntityInfo = internalQuery({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({
    workspaceKey: v.string(),
    workspaceName: v.string(),
  }),
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get('workspaces', args.workspaceId);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    return {
      workspaceKey: workspace.workspaceKey,
      workspaceName: workspace.name,
    };
  },
});

/**
 * Purges workspace tombstones whose purgeAt has passed.
 * Called daily by cron job.
 */
export const purgeDeletedWorkspaces = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredWorkspaces = await ctx.db
      .query('workspaces')
      .withIndex('by_status', (q) => q.eq('status', 'deleted'))
      .filter((q) => q.lt(q.field('purgeAt'), now))
      .collect();

    for (const workspace of expiredWorkspaces) {
      await ctx.db.delete('workspaces', workspace._id);
    }

    if (expiredWorkspaces.length > 0) {
      logger.info({
        event: 'workspace.tombstones_purged',
        category: 'WORKSPACE',
        context: {
          purgedCount: expiredWorkspaces.length,
        },
      });
    }

    return { purgedCount: expiredWorkspaces.length };
  },
});
