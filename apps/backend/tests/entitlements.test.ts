import { api } from '../convex/_generated/api';
import {
  PAST_DUE_GRACE_PERIOD_MS,
  resolveBillingLifecycle,
  resolveEffectivePlanKey,
  resolveWorkspaceAccountDeletionEligibility,
  resolveWorkspaceEntitlements,
} from '../convex/entitlements/service';
import { createConvexTest } from './lib/convexTest';
import {
  authForUser,
  getDoc,
  seedBillingState,
  seedInvite,
  seedMembership,
  seedUser,
  seedWorkspace,
  TEST_NOW,
} from './lib/fixtures';

describe('entitlements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('resolveBillingLifecycle keeps past_due active during grace and locks after grace', () => {
    const inGrace = resolveBillingLifecycle({
      status: 'past_due',
      pastDueAt: TEST_NOW,
      now: TEST_NOW + PAST_DUE_GRACE_PERIOD_MS - 1,
    });
    expect(inGrace).toMatchObject({
      effectiveStatus: 'active',
      isInGrace: true,
      isLocked: false,
    });

    const afterGrace = resolveBillingLifecycle({
      status: 'past_due',
      pastDueAt: TEST_NOW,
      now: TEST_NOW + PAST_DUE_GRACE_PERIOD_MS + 1,
    });
    expect(afterGrace).toMatchObject({
      effectiveStatus: 'past_due',
      isInGrace: false,
      isLocked: true,
    });
  });

  test('resolveWorkspaceEntitlements downgrades canceled workspaces to free plan', () => {
    const entitlements = resolveWorkspaceEntitlements({
      planKey: 'pro_monthly',
      status: 'canceled',
      pastDueAt: undefined,
      now: TEST_NOW,
      usage: {
        memberCount: 1,
        ownerCount: 1,
        pendingInviteCount: 0,
      },
    });

    expect(resolveEffectivePlanKey('pro_monthly', 'canceled')).toBe('free');
    expect(entitlements.effectivePlanKey).toBe('free');
    expect(entitlements.features.team_members).toBe(false);
    expect(entitlements.isSoloWorkspace).toBe(true);
  });

  test('resolveWorkspaceAccountDeletionEligibility only auto deletes non-billable solo workspaces', () => {
    expect(
      resolveWorkspaceAccountDeletionEligibility({
        status: 'active',
        usage: { memberCount: 1, ownerCount: 1, pendingInviteCount: 0 },
      }),
    ).toMatchObject({
      isSingleOwnerSingleMember: true,
      hasBillableLifecycle: true,
      canAutoDeleteOnAccountDeletion: false,
    });

    expect(
      resolveWorkspaceAccountDeletionEligibility({
        status: 'none',
        usage: { memberCount: 1, ownerCount: 1, pendingInviteCount: 0 },
      }),
    ).toMatchObject({
      isSingleOwnerSingleMember: true,
      hasBillableLifecycle: false,
      canAutoDeleteOnAccountDeletion: true,
    });
  });

  test('getWorkspaceEntitlements counts only active members and non-expired pending invites', async () => {
    const t = createConvexTest();
    const ownerId = await seedUser(t, { email: 'owner@example.test' });
    const deletedUserId = await seedUser(t, {
      status: 'deleted',
      deletedAt: TEST_NOW,
      purgeAt: TEST_NOW + 1_000,
    });
    const workspaceId = await seedWorkspace(t, ownerId);
    await seedMembership(t, workspaceId, ownerId, 'owner');
    await seedMembership(t, workspaceId, deletedUserId, 'member');
    await seedBillingState(t, workspaceId, {
      planKey: 'pro_monthly',
      status: 'past_due',
      pastDueAt: TEST_NOW,
    });
    await seedInvite(t, {
      workspaceId,
      invitedByUserId: ownerId,
      email: 'future@example.test',
      expiresAt: TEST_NOW + 10_000,
    });
    await seedInvite(t, {
      workspaceId,
      invitedByUserId: ownerId,
      email: 'expired@example.test',
      expiresAt: TEST_NOW - 10_000,
    });

    const owner = await getDoc(t, 'users', ownerId);
    const entitlements = await t
      .withIdentity(authForUser(owner!))
      .query(api.entitlements.index.getWorkspaceEntitlements, {
        workspaceId,
      });

    expect(entitlements.plan.key).toBe('pro_monthly');
    expect(entitlements.lifecycle.status).toBe('active');
    expect(entitlements.lifecycle.isInGrace).toBe(true);
    expect(entitlements.usage).toEqual({
      memberCount: 1,
      ownerCount: 1,
      pendingInviteCount: 1,
    });
  });
});
