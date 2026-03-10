import { HOUR, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from './_generated/api';

const rateLimits = {
  requestAvatarUploadUrlByUser: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 3,
  },
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
} as const;

/**
 * Shared Convex application-level rate limits.
 *
 * Keep all named limits in one place to ensure consistent behavior
 * and type-safe references across backend mutations.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, rateLimits);
