import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from './_generated/api';

const rateLimits = {
  createWorkspaceByUser: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  createInviteByUser: {
    kind: 'token bucket',
    rate: 60,
    period: HOUR,
    capacity: 15,
  },
  acceptInviteByUser: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 10,
  },
  mutateContactsByActor: {
    kind: 'token bucket',
    rate: 180,
    period: MINUTE,
    capacity: 60,
  },
} as const;

/**
 * Shared Convex application-level rate limits.
 *
 * Keep all named limits in one place to ensure consistent behavior
 * and type-safe references across backend mutations.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, rateLimits);
