import { type ConvexError } from 'convex/values';
import { expect } from 'vitest';

import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { TestConvex } from './convexTest';

type AppErrorShape = {
  code: string;
  category: string;
  message: string;
  context: Record<string, unknown>;
};

type UserStatus = Doc<'users'>['status'];
type WorkspaceStatus = Doc<'workspaces'>['status'];
type MembershipRole = Doc<'workspaceMembers'>['role'];
type PlanKey = Doc<'workspaceBillingState'>['planKey'];
type BillingStatus = Doc<'workspaceBillingState'>['status'];
type InviteStatus = Doc<'workspaceInvites'>['status'];
type InviteRole = Doc<'workspaceInvites'>['role'];

export type BackendTestConvex = ReturnType<typeof import('./convexTest').createConvexTest>;

export const TEST_NOW = Date.parse('2026-01-15T12:00:00.000Z');

let sequence = 0;

const nextSuffix = (label: string) => {
  sequence += 1;
  return `${label}-${sequence}`;
};

const asAppError = (error: unknown) => {
  const maybeError = error as ConvexError<AppErrorShape> & { data?: AppErrorShape };
  if (!maybeError?.data?.code) {
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message) as AppErrorShape;
        if (parsed?.code) {
          return parsed;
        }
      } catch {
        // Fall through to rethrow the original error.
      }
    }
    throw error;
  }
  return maybeError.data;
};

export const expectAppError = async (
  action: Promise<unknown> | (() => Promise<unknown>),
  code: string,
  context?: Record<string, unknown>,
) => {
  const promise =
    typeof action === 'function' ? Promise.resolve().then(() => action()) : Promise.resolve(action);

  const error = await promise.then(
    () => {
      throw new Error(`Expected promise to reject with ${code}`);
    },
    (rejection) => rejection,
  );

  const data = asAppError(error);
  expect(data.code).toBe(code);
  if (context) {
    expect(data.context).toMatchObject(context);
  }
  return data;
};

export const authForUser = (user: Pick<Doc<'users'>, 'authId' | 'email'>) => ({
  subject: user.authId ?? 'missing-auth-id',
  email: user.email ?? 'missing@example.test',
  name: user.email ?? 'missing@example.test',
});

export const seedUser = async (
  t: BackendTestConvex,
  options: {
    authId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profilePictureUrl?: string;
    workosProfilePictureUrl?: string;
    avatarKey?: string;
    avatarSource?: 'workos' | 'custom';
    onboardingStatus?: 'not_started' | 'completed';
    status?: UserStatus;
    deletingAt?: number;
    deletedAt?: number;
    purgeAt?: number;
    deleteInfo?: Doc<'users'> extends { delete: infer T } ? T : never;
    updatedAt?: number;
  } = {},
) =>
  t.run(async (ctx) => {
    const label = nextSuffix('user');
    const status = options.status ?? 'active';
    const now = options.updatedAt ?? TEST_NOW;

    return ctx.db.insert('users', {
      status,
      authId: status === 'deleted' ? options.authId : (options.authId ?? `auth-${label}`),
      email: status === 'deleted' ? options.email : (options.email ?? `${label}@example.test`),
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? label,
      onboardingStatus: options.onboardingStatus ?? 'not_started',
      updatedAt: now,
      profilePictureUrl: options.profilePictureUrl,
      workosProfilePictureUrl: options.workosProfilePictureUrl,
      avatarSource: options.avatarSource ?? 'workos',
      avatarKey: options.avatarKey,
      deletingAt: options.deletingAt,
      deletedAt: options.deletedAt,
      purgeAt: options.purgeAt,
      delete: options.deleteInfo,
    });
  });

export const seedWorkspace = async (
  t: BackendTestConvex,
  createdByUserId: Id<'users'>,
  options: {
    name?: string;
    workspaceKey?: string;
    status?: WorkspaceStatus;
    deletedAt?: number;
    purgeAt?: number;
    deletedByUserId?: Id<'users'>;
    updatedAt?: number;
  } = {},
) =>
  t.run(async (ctx) => {
    const label = nextSuffix('workspace');
    return ctx.db.insert('workspaces', {
      name: options.name ?? `Workspace ${label}`,
      workspaceKey: options.workspaceKey ?? `workspace-${label}`,
      createdByUserId,
      creatorDisplayEmailSnapshot: `${label}@creator.example.test`,
      creatorDisplayNameSnapshot: `Creator ${label}`,
      updatedAt: options.updatedAt ?? TEST_NOW,
      status: options.status ?? 'active',
      deletedAt: options.deletedAt,
      purgeAt: options.purgeAt,
      deletedByUserId: options.deletedByUserId,
    });
  });

export const seedMembership = async (
  t: BackendTestConvex,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
  role: MembershipRole = 'member',
  updatedAt = TEST_NOW,
) =>
  t.run((ctx) =>
    ctx.db.insert('workspaceMembers', {
      workspaceId,
      userId,
      role,
      updatedAt,
    }),
  );

export const seedBillingState = async (
  t: BackendTestConvex,
  workspaceId: Id<'workspaces'>,
  options: {
    planKey?: PlanKey;
    status?: BillingStatus;
    periodEnd?: number;
    cancelAtPeriodEnd?: boolean;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    providerSubscriptionUpdatedAt?: number;
    pastDueAt?: number;
    updatedAt?: number;
  } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert('workspaceBillingState', {
      workspaceId,
      planKey: options.planKey ?? 'free',
      status: options.status ?? 'none',
      periodEnd: options.periodEnd,
      cancelAtPeriodEnd: options.cancelAtPeriodEnd,
      providerCustomerId: options.providerCustomerId,
      providerSubscriptionId: options.providerSubscriptionId,
      providerSubscriptionUpdatedAt: options.providerSubscriptionUpdatedAt,
      pastDueAt: options.pastDueAt,
      updatedAt: options.updatedAt ?? TEST_NOW,
    }),
  );

export const seedInvite = async (
  t: BackendTestConvex,
  options: {
    workspaceId: Id<'workspaces'>;
    invitedByUserId: Id<'users'>;
    email?: string;
    role?: InviteRole;
    token?: string;
    status?: InviteStatus;
    invitedUserId?: Id<'users'>;
    acceptedByUserId?: Id<'users'>;
    acceptedAt?: number;
    expiresAt?: number;
    updatedAt?: number;
  },
) =>
  t.run((ctx) =>
    ctx.db.insert('workspaceInvites', {
      workspaceId: options.workspaceId,
      email: options.email ?? `invite-${nextSuffix('email')}@example.test`,
      role: options.role ?? 'member',
      token: options.token ?? `token-${nextSuffix('invite')}`,
      status: options.status ?? 'pending',
      invitedByUserId: options.invitedByUserId,
      invitedUserId: options.invitedUserId,
      acceptedByUserId: options.acceptedByUserId,
      acceptedAt: options.acceptedAt,
      expiresAt: options.expiresAt ?? TEST_NOW + 7 * 24 * 60 * 60 * 1000,
      updatedAt: options.updatedAt ?? TEST_NOW,
      inviterDisplayNameSnapshot: 'Inviter',
      inviterDisplayEmailSnapshot: 'inviter@example.test',
    }),
  );

export const seedPendingUpload = async (
  t: BackendTestConvex,
  options: {
    key: string;
    requestedByUserId: Id<'users'>;
    kind: string;
    workspaceId?: Id<'workspaces'>;
    expiresAt?: number;
  },
) =>
  t.run((ctx) =>
    ctx.db.insert('uploads', {
      key: options.key,
      requestedByUserId: options.requestedByUserId,
      kind: options.kind,
      workspaceId: options.workspaceId,
      expiresAt: options.expiresAt ?? TEST_NOW + 60_000,
    }),
  );

export const getDoc = async <
  TableName extends keyof import('../../convex/_generated/dataModel').DataModel,
>(
  t: BackendTestConvex,
  tableName: TableName,
  id: Id<TableName>,
) => t.run((ctx) => ctx.db.get(tableName, id));
