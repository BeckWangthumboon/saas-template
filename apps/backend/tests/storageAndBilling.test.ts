import { vi } from 'vitest';

vi.mock('../convex/storage/r2Client', () => ({
  deleteR2Object: vi.fn().mockResolvedValue(undefined),
  deleteR2ObjectOrDefer: vi.fn().mockResolvedValue({ deleted: true }),
  generateR2UploadUrlForKey: vi.fn().mockResolvedValue({ url: 'https://upload.example.test' }),
  getR2Metadata: vi.fn().mockResolvedValue({ contentType: 'text/plain', size: 128 }),
  getR2SignedUrl: vi.fn().mockResolvedValue('https://download.example.test'),
  syncR2Metadata: vi.fn().mockResolvedValue(undefined),
}));

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
  expectAppError,
  getDoc,
  seedBillingState,
  seedMembership,
  seedPendingUpload,
  seedUser,
  seedWorkspace,
  seedWorkspaceFile,
  TEST_NOW,
} from './lib/fixtures';

describe('storage and billing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('finalizeWorkspacePendingUpload is idempotent for existing files and cleans up missing metadata', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, { planKey: 'pro_monthly', status: 'active' });

    const existingKey = `workspaces/${workspaceId}/files/existing.txt`;
    const existingFileId = await seedWorkspaceFile(t, {
      workspaceId,
      uploadedByUserId: ownerId,
      key: existingKey,
    });
    await seedPendingUpload(t, {
      key: existingKey,
      kind: 'workspace_file',
      requestedByUserId: ownerId,
      workspaceId,
    });

    const owner = await getDoc(t, 'users', ownerId);
    const resolvedExistingFileId = await t
      .withIdentity(authForUser(owner!))
      .mutation(internal.workspaceFiles.upload.finalizeWorkspacePendingUpload, {
        workspaceId,
        key: existingKey,
        fileName: 'existing.txt',
        metadataFound: true,
        contentType: 'text/plain',
        size: 128,
      });

    expect(resolvedExistingFileId).toBe(existingFileId);

    const missingMetadataKey = `workspaces/${workspaceId}/files/missing.txt`;
    await seedPendingUpload(t, {
      key: missingMetadataKey,
      kind: 'workspace_file',
      requestedByUserId: ownerId,
      workspaceId,
    });

    await expectAppError(
      () =>
        t
          .withIdentity(authForUser(owner!))
          .mutation(internal.workspaceFiles.upload.finalizeWorkspacePendingUpload, {
            workspaceId,
            key: missingMetadataKey,
            fileName: 'missing.txt',
            metadataFound: false,
            contentType: undefined,
            size: undefined,
          }),
      'WORKSPACE_FILE_UPLOAD_NOT_FOUND',
    );
  });

  test('getWorkspaceFile returns a signed URL and deleteWorkspaceFile removes the row', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, { planKey: 'pro_monthly', status: 'active' });
    const fileId = await seedWorkspaceFile(t, {
      workspaceId,
      uploadedByUserId: ownerId,
      key: `workspaces/${workspaceId}/download.txt`,
    });

    const owner = await getDoc(t, 'users', ownerId);
    const file = await t
      .withIdentity(authForUser(owner!))
      .action(api.workspaceFiles.index.getWorkspaceFile, {
        workspaceId,
        fileId,
      });
    expect(file.url).toBe('https://download.example.test');

    await t
      .withIdentity(authForUser(owner!))
      .mutation(api.workspaceFiles.index.deleteWorkspaceFile, {
        workspaceId,
        fileId,
      });
    expect(await getDoc(t, 'workspaceFiles', fileId)).toBeNull();
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
