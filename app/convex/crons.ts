import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'reconcile stuck user deletions',
  { hourUTC: 2, minuteUTC: 30 },
  internal.user.reconcileStuckUserDeletions,
);

crons.daily(
  'purge deleted user tombstones',
  { hourUTC: 3, minuteUTC: 0 },
  internal.user.purgeDeletedUsers,
);

export default crons;
