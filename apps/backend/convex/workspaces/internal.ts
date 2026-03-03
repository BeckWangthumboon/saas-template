import './triggers';

import { internalMutation } from '../functions';
import { logger } from '../logging';

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
