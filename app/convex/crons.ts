import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'purge deleted user tombstones',
  { hourUTC: 3, minuteUTC: 0 },
  internal.user.purgeDeletedUsers,
);

export default crons;
