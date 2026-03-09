import { api } from '../convex/_generated/api';
import { createConvexTest } from './lib/convexTest';
import {
  authForUser,
  expectAppError,
  getDoc,
  seedBillingState,
  seedMembership,
  seedUser,
  seedWorkspace,
  TEST_NOW,
} from './lib/fixtures';

describe('workspaces', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('createWorkspace creates owner membership and default billing state', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const owner = await getDoc(t, 'users', ownerId);

    const result = await t
      .withIdentity(authForUser(owner!))
      .mutation(api.workspaces.index.createWorkspace, {
        name: '  Platform  ',
      });

    const workspace = await getDoc(t, 'workspaces', result.workspaceId);
    const billingState = await t.run((ctx) =>
      ctx.db
        .query('workspaceBillingState')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', result.workspaceId))
        .unique(),
    );
    const membership = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId_userId', (q) =>
          q.eq('workspaceId', result.workspaceId).eq('userId', ownerId),
        )
        .unique(),
    );

    expect(workspace?.name).toBe('Platform');
    expect(membership?.role).toBe('owner');
    expect(billingState).toMatchObject({ planKey: 'free', status: 'none' });
  });

  test('ensureDefaultWorkspaceForCurrentUser ignores deleted memberships and creates a default workspace', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId, {
      status: 'deleted',
      deletedAt: TEST_NOW,
      purgeAt: TEST_NOW + 1_000,
      deletedByUserId: ownerId,
    });
    await seedMembership(t, workspaceId, ownerId, 'owner');

    const owner = await getDoc(t, 'users', ownerId);
    const result = await t
      .withIdentity(authForUser(owner!))
      .mutation(api.workspaces.index.ensureDefaultWorkspaceForCurrentUser, {});

    expect(result.workspaceId).not.toBe(workspaceId);
    const created = await getDoc(t, 'workspaces', result.workspaceId);
    expect(created?.name).toBe('My Workspace');
  });

  test('updateWorkspaceName allows admins and rejects members', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const adminId = await seedUser(t, { email: 'admin@example.test' });
    const memberId = await seedUser(t, { email: 'member@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedMembership(t, workspaceId, adminId, 'admin');
    await seedMembership(t, workspaceId, memberId, 'member');

    const admin = await getDoc(t, 'users', adminId);
    await t.withIdentity(authForUser(admin!)).mutation(api.workspaces.index.updateWorkspaceName, {
      workspaceId,
      name: ' Renamed Workspace ',
    });

    const updated = await getDoc(t, 'workspaces', workspaceId);
    expect(updated?.name).toBe('Renamed Workspace');

    const member = await getDoc(t, 'users', memberId);
    await expectAppError(
      () =>
        t.withIdentity(authForUser(member!)).mutation(api.workspaces.index.updateWorkspaceName, {
          workspaceId,
          name: 'Nope',
        }),
      'WORKSPACE_INSUFFICIENT_ROLE',
    );
  });

  test('leaveWorkspace blocks the last owner and allows leaving when another owner exists', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const secondOwnerId = await seedUser(t, { email: 'second-owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');

    const owner = await getDoc(t, 'users', ownerId);
    await expectAppError(
      () =>
        t.withIdentity(authForUser(owner!)).mutation(api.workspaces.index.leaveWorkspace, {
          workspaceId,
        }),
      'WORKSPACE_LAST_OWNER',
    );

    await seedMembership(t, workspaceId, secondOwnerId, 'owner');
    await t.withIdentity(authForUser(owner!)).mutation(api.workspaces.index.leaveWorkspace, {
      workspaceId,
    });

    const membership = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId_userId', (q) =>
          q.eq('workspaceId', workspaceId).eq('userId', ownerId),
        )
        .unique(),
    );
    expect(membership).toBeNull();
  });

  test('deleteWorkspace tombstones non-billable workspaces and blocks active billing', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, { status: 'active', planKey: 'pro_monthly' });

    const owner = await getDoc(t, 'users', ownerId);
    await expectAppError(
      () =>
        t.withIdentity(authForUser(owner!)).mutation(api.workspaces.index.deleteWorkspace, {
          workspaceId,
        }),
      'BILLING_WORKSPACE_DELETE_BLOCKED',
    );

    const billingState = await t.run((ctx) =>
      ctx.db
        .query('workspaceBillingState')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
        .unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch('workspaceBillingState', billingState!._id, { status: 'none' }),
    );

    await t.withIdentity(authForUser(owner!)).mutation(api.workspaces.index.deleteWorkspace, {
      workspaceId,
    });

    const workspace = await getDoc(t, 'workspaces', workspaceId);
    expect(workspace).toMatchObject({
      status: 'deleted',
      deletedByUserId: ownerId,
    });
  });

  test('removeMember and updateMemberRole enforce admin and owner restrictions', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const adminId = await seedUser(t, { email: 'admin@example.test' });
    const otherAdminId = await seedUser(t, { email: 'other-admin@example.test' });
    const memberId = await seedUser(t, { email: 'member@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedMembership(t, workspaceId, adminId, 'admin');
    await seedMembership(t, workspaceId, otherAdminId, 'admin');
    await seedMembership(t, workspaceId, memberId, 'member');

    const admin = await getDoc(t, 'users', adminId);
    await expectAppError(
      () =>
        t.withIdentity(authForUser(admin!)).mutation(api.workspaces.members.removeMember, {
          workspaceId,
          userId: otherAdminId,
        }),
      'WORKSPACE_INSUFFICIENT_ROLE',
    );

    await t.withIdentity(authForUser(admin!)).mutation(api.workspaces.members.removeMember, {
      workspaceId,
      userId: memberId,
    });

    const removedMembership = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId_userId', (q) =>
          q.eq('workspaceId', workspaceId).eq('userId', memberId),
        )
        .unique(),
    );
    expect(removedMembership).toBeNull();

    await expectAppError(
      () =>
        t.withIdentity(authForUser(admin!)).mutation(api.workspaces.members.updateMemberRole, {
          workspaceId,
          userId: otherAdminId,
          role: 'member',
        }),
      'WORKSPACE_INSUFFICIENT_ROLE',
    );
  });
});
