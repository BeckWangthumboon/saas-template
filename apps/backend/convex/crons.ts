import { cronJobs } from 'convex/server';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import { internalMutation } from './functions';

const crons = cronJobs();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_HUNDRED_TWENTY_DAYS_MS = 120 * 24 * 60 * 60 * 1000;

crons.daily(
  'reconcile stuck user deletions',
  { hourUTC: 2, minuteUTC: 30 },
  internal.users.internal.reconcileStuckUserDeletions,
);

crons.daily(
  'purge deleted user tombstones',
  { hourUTC: 3, minuteUTC: 0 },
  internal.users.internal.purgeDeletedUsers,
);

crons.daily(
  'purge deleted workspace tombstones',
  { hourUTC: 3, minuteUTC: 30 },
  internal.workspaces.internal.purgeDeletedWorkspaces,
);

crons.daily(
  'cleanup resend email component data',
  { hourUTC: 4, minuteUTC: 0 },
  internal.crons.cleanupResendEmailData,
  {},
);

crons.daily(
  'cleanup expired workspace file uploads',
  { hourUTC: 4, minuteUTC: 0 },
  internal.workspaceFiles.upload.cleanupExpiredWorkspaceFileUploads,
);

crons.daily(
  'cleanup expired avatar uploads',
  { hourUTC: 4, minuteUTC: 30 },
  internal.users.avatar.cleanupExpiredAvatarUploads,
);

crons.daily(
  'reconcile failed r2 deletes',
  { hourUTC: 5, minuteUTC: 0 },
  internal.storage.deletes.reconcileFailedR2Deletes,
);

/**
 * Schedules cleanup jobs for finalized and abandoned resend component emails.
 */
export const cleanupResendEmailData = internalMutation({
  args: {
    finalizedOlderThan: v.optional(v.number()),
    abandonedOlderThan: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
      olderThan: args.finalizedOlderThan ?? THIRTY_DAYS_MS,
    });

    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupAbandonedEmails, {
      olderThan: args.abandonedOlderThan ?? ONE_HUNDRED_TWENTY_DAYS_MS,
    });

    return null;
  },
});

export default crons;
