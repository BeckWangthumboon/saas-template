import { vi } from 'vitest';

vi.mock('../convex/billing/polarClient', () => ({
  polar: {
    checkouts: {
      create: vi.fn().mockResolvedValue({ url: 'https://polar.example.test/checkout' }),
    },
    customerSessions: {
      create: vi.fn().mockResolvedValue({
        customerPortalUrl: 'https://polar.example.test/portal',
      }),
    },
    subscriptions: {
      get: vi.fn().mockResolvedValue({ customerId: 'customer-from-subscription' }),
    },
  },
}));

vi.mock('@polar-sh/sdk/webhooks', () => ({
  WebhookVerificationError: class WebhookVerificationError extends Error {},
  validateEvent: vi.fn(),
}));

import { api, internal } from '../convex/_generated/api';
import { createConvexTest } from './lib/convexTest';
import {
  authForUser,
  getDoc,
  seedBillingState,
  seedMembership,
  seedUser,
  seedWorkspace,
  TEST_NOW,
} from './lib/fixtures';

describe('billing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  test('handlePolarSubscriptionEvent is idempotent and ignores stale subscription updates', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, {
      planKey: 'free',
      status: 'none',
      providerSubscriptionUpdatedAt: TEST_NOW + 10_000,
    });

    await t.mutation(internal.billing.webhooks.handlePolarSubscriptionEvent, {
      eventId: 'evt-1',
      eventType: 'subscription.updated',
      eventTimestamp: TEST_NOW,
      subscriptionId: 'sub-1',
      customerId: 'cus-1',
      productId: 'prod_monthly',
      status: 'active',
      currentPeriodEnd: TEST_NOW + 30_000,
      subscriptionUpdatedAt: TEST_NOW,
      cancelAtPeriodEnd: false,
      workspaceId: workspaceId as string,
    });

    const billingState = await t.run((ctx) =>
      ctx.db
        .query('workspaceBillingState')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
        .unique(),
    );
    expect(billingState).toMatchObject({
      planKey: 'free',
      status: 'none',
      providerSubscriptionUpdatedAt: TEST_NOW + 10_000,
    });

    await t.mutation(internal.billing.webhooks.handlePolarSubscriptionEvent, {
      eventId: 'evt-1',
      eventType: 'subscription.updated',
      eventTimestamp: TEST_NOW,
      subscriptionId: 'sub-1',
      customerId: 'cus-1',
      productId: 'prod_monthly',
      status: 'active',
      currentPeriodEnd: TEST_NOW + 30_000,
      subscriptionUpdatedAt: TEST_NOW + 20_000,
      cancelAtPeriodEnd: false,
      workspaceId: workspaceId as string,
    });

    const billingEvents = await t.run((ctx) => ctx.db.query('billingEvents').collect());
    expect(billingEvents).toHaveLength(1);
  });

  test('startCheckout and createBillingPortalSession use billing state and Polar client results', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId, { workspaceKey: 'acme' });
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, {
      planKey: 'pro_monthly',
      status: 'active',
      providerCustomerId: 'cus-existing',
      providerSubscriptionId: 'sub-existing',
    });

    const owner = await getDoc(t, 'users', ownerId);
    const checkout = await t
      .withIdentity(authForUser(owner!))
      .action(api.billing.index.startCheckout, {
        workspaceId,
        planKey: 'pro_monthly',
      });
    const portal = await t
      .withIdentity(authForUser(owner!))
      .action(api.billing.index.createBillingPortalSession, { workspaceId });

    expect(checkout.url).toBe('https://polar.example.test/checkout');
    expect(portal.url).toBe('https://polar.example.test/portal');
  });

  test('polarWebhook returns 400 without a webhook id header', async () => {
    const t = createConvexTest();
    const response = await t.fetch('/billing/polar/events', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(response.status).toBe(400);
  });

  test('getWorkspaceBillingSummary resolves grace periods for members', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, {
      planKey: 'pro_yearly',
      status: 'past_due',
      pastDueAt: TEST_NOW,
    });

    const owner = await getDoc(t, 'users', ownerId);
    const summary = await t
      .withIdentity(authForUser(owner!))
      .query(api.billing.index.getWorkspaceBillingSummary, {
        workspaceId,
      });

    expect(summary).toMatchObject({
      planKey: 'pro_yearly',
      effectiveStatus: 'active',
      isInGrace: true,
    });
  });
});
