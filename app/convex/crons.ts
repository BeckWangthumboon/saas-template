import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

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

export default crons;
