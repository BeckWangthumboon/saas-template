import { api, internal } from '../convex/_generated/api';
import { createConvexTest } from './lib/convexTest';
import {
  authForUser,
  expectAppError,
  getDoc,
  seedBillingState,
  seedInvite,
  seedMembership,
  seedUser,
  seedWorkspace,
  TEST_NOW,
} from './lib/fixtures';

describe('users', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('getUserOrNull returns null for unauthenticated callers and active users for authenticated callers', async () => {
    const t = createConvexTest();
    expect(await t.query(api.users.index.getUserOrNull, {})).toBeNull();

    const userId = await seedUser(t, { email: 'user@example.test' });
    const user = await getDoc(t, 'users', userId);
    const currentUser = await t
      .withIdentity(authForUser(user!))
      .query(api.users.index.getUserOrNull, {});

    expect(currentUser?._id).toBe(userId);
  });

  test('updateName is a no-op when the name is unchanged', async () => {
    const t = createConvexTest();
    const userId = await seedUser(t, {
      email: 'user@example.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
      updatedAt: TEST_NOW,
    });
    const user = await getDoc(t, 'users', userId);

    await t.withIdentity(authForUser(user!)).mutation(api.users.index.updateName, {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    const updated = await getDoc(t, 'users', userId);
    expect(updated?.updatedAt).toBe(TEST_NOW);
  });

  test('deleteAccount blocks billable sole-owner workspaces and cleans up eligible accounts', async () => {
    const t = createConvexTest();
    const userId = await seedUser(t, { email: 'owner@example.test' });
    const blockedWorkspaceId = await seedWorkspace(t, userId, { name: 'Blocked' });
    await seedMembership(t, blockedWorkspaceId, userId, 'owner');
    await seedBillingState(t, blockedWorkspaceId, { status: 'active', planKey: 'pro_monthly' });

    const user = await getDoc(t, 'users', userId);
    await expectAppError(
      () => t.withIdentity(authForUser(user!)).mutation(api.users.index.deleteAccount, {}),
      'BILLING_ACCOUNT_DELETE_BLOCKED',
    );

    const eligibleWorkspaceId = await seedWorkspace(t, userId, { name: 'Solo' });
    await seedMembership(t, eligibleWorkspaceId, userId, 'owner');
    await seedBillingState(t, eligibleWorkspaceId, { status: 'none', planKey: 'free' });
    await t.run(async (ctx) => {
      const blockedState = await ctx.db
        .query('workspaceBillingState')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', blockedWorkspaceId))
        .unique();
      await ctx.db.patch('workspaceBillingState', blockedState!._id, {
        status: 'canceled',
      });
    });
    await seedInvite(t, {
      workspaceId: eligibleWorkspaceId,
      invitedByUserId: userId,
      email: 'owner@example.test',
      invitedUserId: userId,
    });

    await t.withIdentity(authForUser(user!)).mutation(api.users.index.deleteAccount, {});

    const deletingUser = await getDoc(t, 'users', userId);
    const eligibleWorkspace = await getDoc(t, 'workspaces', eligibleWorkspaceId);
    const memberships = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .collect(),
    );
    const invites = await t.run((ctx) =>
      ctx.db
        .query('workspaceInvites')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', eligibleWorkspaceId))
        .collect(),
    );

    expect(deletingUser).toMatchObject({
      status: 'deleting',
      delete: {
        attempts: 1,
      },
    });
    expect(eligibleWorkspace?.status).toBe('deleted');
    expect(memberships).toHaveLength(0);
    expect(invites).toHaveLength(0);
  });

  test('deleteAccountOnComplete clears PII and reconcileStuckUserDeletions requeues due users', async () => {
    const t = createConvexTest();
    const userId = await seedUser(t, {
      status: 'deleting',
      authId: 'auth-user',
      email: 'user@example.test',
      avatarSource: 'custom',
      avatarKey: 'avatars/custom.png',
      deletingAt: TEST_NOW - 10_000,
      deleteInfo: {
        attempts: 1,
        lastAttemptAt: TEST_NOW - 10_000,
        nextAttemptAt: TEST_NOW - 1_000,
        workId: 'work-1',
      },
    });

    const retryUserId = await seedUser(t, {
      status: 'deleting',
      authId: 'retry-auth',
      email: 'retry@example.test',
      deletingAt: TEST_NOW - 20_000,
      deleteInfo: {
        attempts: 1,
        lastAttemptAt: TEST_NOW - 20_000,
        nextAttemptAt: TEST_NOW - 1_000,
        workId: 'work-old',
      },
    });
    await t.mutation(internal.users.internal.reconcileStuckUserDeletions, {});

    const retriedUser = await getDoc(t, 'users', retryUserId);
    expect(retriedUser?.delete).toMatchObject({
      attempts: 2,
    });
    expect(retriedUser?.status).toBe('deleting');
  });
});
