import { httpRouter } from 'convex/server';

import { internal } from './_generated/api';
import { polar } from './billing/polarClient';
import { authKit } from './users/auth';

const http = httpRouter();
authKit.registerRoutes(http);

/**
 * Converts a date-like webhook value to a timestamp.
 *
 * @param value - Date, ISO string, or null.
 * @returns Milliseconds since epoch or null.
 */
const toMillis = (value: unknown): number | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }
  return null;
};

polar.registerRoutes(http, {
  onSubscriptionCreated: async (ctx, event) => {
    await ctx.runMutation(internal.billing.sync.applySubscriptionUpdate, {
      providerCustomerId: event.data.customerId,
      providerSubscriptionId: event.data.id,
      productId: event.data.productId,
      status: event.data.status,
      periodEnd: toMillis(event.data.currentPeriodEnd),
      cancelAtPeriodEnd: event.data.cancelAtPeriodEnd,
    });
  },
  onSubscriptionUpdated: async (ctx, event) => {
    await ctx.runMutation(internal.billing.sync.applySubscriptionUpdate, {
      providerCustomerId: event.data.customerId,
      providerSubscriptionId: event.data.id,
      productId: event.data.productId,
      status: event.data.status,
      periodEnd: toMillis(event.data.currentPeriodEnd),
      cancelAtPeriodEnd: event.data.cancelAtPeriodEnd,
    });
  },
});
export default http;
