import { api } from '../convex/_generated/api';
import { createConvexTest } from './lib/convexTest';
import {
  authForUser,
  expectAppError,
  getDoc,
  seedBillingState,
  seedContact,
  seedInvite,
  seedMembership,
  seedUser,
  seedWorkspace,
  TEST_NOW,
} from './lib/fixtures';

describe('invites and contacts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('createInvite creates and reuses an active invite for the same email', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test', firstName: 'Owner' });
    const workspaceId = await seedWorkspace(t, ownerId, { name: 'Acme' });
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, { planKey: 'pro_monthly', status: 'active' });

    const owner = await getDoc(t, 'users', ownerId);
    const firstInvite = await t
      .withIdentity(authForUser(owner!))
      .mutation(api.workspaces.invites.createInvite, {
        workspaceId,
        email: 'Teammate@Example.test',
        inviteeRole: 'member',
      });

    const resentInvite = await t
      .withIdentity(authForUser(owner!))
      .mutation(api.workspaces.invites.createInvite, {
        workspaceId,
        email: 'teammate@example.test',
        inviteeRole: 'admin',
      });

    expect(firstInvite.wasResent).toBe(false);
    expect(resentInvite).toMatchObject({
      inviteId: firstInvite.inviteId,
      token: firstInvite.token,
      wasResent: true,
    });

    const invite = await getDoc(t, 'workspaceInvites', firstInvite.inviteId);
    expect(invite).toMatchObject({
      email: 'teammate@example.test',
      role: 'admin',
      status: 'pending',
    });
  });

  test('acceptInvite recreates membership for already accepted invites', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const inviteeId = await seedUser(t, { email: 'invitee@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, { planKey: 'pro_monthly', status: 'active' });

    const inviteId = await seedInvite(t, {
      workspaceId,
      invitedByUserId: ownerId,
      invitedUserId: inviteeId,
      acceptedByUserId: inviteeId,
      acceptedAt: TEST_NOW - 100,
      status: 'accepted',
      token: 'accepted-token',
      email: 'invitee@example.test',
    });

    const invitee = await getDoc(t, 'users', inviteeId);
    const accepted = await t
      .withIdentity(authForUser(invitee!))
      .mutation(api.workspaces.invites.acceptInvite, {
        token: 'accepted-token',
      });

    expect(accepted.workspaceId).toBe(workspaceId);
    const recoveredMembership = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId_userId', (q) =>
          q.eq('workspaceId', workspaceId).eq('userId', inviteeId),
        )
        .unique(),
    );
    expect(recoveredMembership?.role).toBe('member');

    const invite = await getDoc(t, 'workspaceInvites', inviteId);
    expect(invite?.status).toBe('accepted');
  });

  test('createInvite blocks free workspaces and suppressed emails', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, { planKey: 'free', status: 'none' });
    await t.run((ctx) =>
      ctx.db.insert('emailSuppressions', {
        email: 'blocked@example.test',
        reason: 'bounce',
        source: 'manual',
      }),
    );

    const owner = await getDoc(t, 'users', ownerId);
    await expectAppError(
      () =>
        t.withIdentity(authForUser(owner!)).mutation(api.workspaces.invites.createInvite, {
          workspaceId,
          email: 'allowed@example.test',
          inviteeRole: 'member',
        }),
      'BILLING_PLAN_REQUIRED',
    );

    const billingState = await t.run((ctx) =>
      ctx.db
        .query('workspaceBillingState')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
        .unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch('workspaceBillingState', billingState!._id, {
        planKey: 'pro_monthly',
        status: 'active',
      }),
    );

    await expectAppError(
      () =>
        t.withIdentity(authForUser(owner!)).mutation(api.workspaces.invites.createInvite, {
          workspaceId,
          email: 'blocked@example.test',
          inviteeRole: 'member',
        }),
      'INVITE_EMAIL_SUPPRESSED',
    );
  });

  test('contacts enforce membership, validation, and update ordering', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const outsiderId = await seedUser(t, { email: 'outsider@example.test' });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedBillingState(t, workspaceId, { planKey: 'pro_monthly', status: 'active' });

    const owner = await getDoc(t, 'users', ownerId);
    const createdContactId = await t
      .withIdentity(authForUser(owner!))
      .mutation(api.contacts.index.createContact, {
        workspaceId,
        name: '  Jane Doe ',
        email: 'JANE@Example.test ',
        notes: '  hello  ',
      });

    const created = await getDoc(t, 'contacts', createdContactId);
    expect(created).toMatchObject({
      name: 'Jane Doe',
      email: 'jane@example.test',
      notes: 'hello',
    });

    await seedContact(t, {
      workspaceId,
      createdByUserId: ownerId,
      name: 'Older',
      updatedAt: TEST_NOW - 1_000,
    });

    const listed = await t
      .withIdentity(authForUser(owner!))
      .query(api.contacts.index.listContacts, {
        workspaceId,
      });
    expect(listed[0]?.name).toBe('Jane Doe');

    const outsider = await getDoc(t, 'users', outsiderId);
    await expectAppError(
      () =>
        t.withIdentity(authForUser(outsider!)).query(api.contacts.index.listContacts, {
          workspaceId,
        }),
      'WORKSPACE_ACCESS_DENIED',
    );
  });
});
