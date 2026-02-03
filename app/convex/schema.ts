import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const userDeleteInfo = v.object({
  attempts: v.optional(v.number()),
  lastAttemptAt: v.optional(v.number()),
  nextAttemptAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  workId: v.optional(v.string()),
});

const userBaseFields = {
  onboardingStatus: v.union(v.literal('not_started'), v.literal('completed')),
  updatedAt: v.number(),
};

const activeUser = v.object({
  ...userBaseFields,
  status: v.literal('active'),
  authId: v.string(),
  email: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  profilePictureUrl: v.optional(v.string()),
});

const deletingUser = v.object({
  ...userBaseFields,
  status: v.literal('deleting'),
  authId: v.string(),
  deletingAt: v.number(),
  delete: userDeleteInfo,
  email: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  profilePictureUrl: v.optional(v.string()),
});

const deletionFailedUser = v.object({
  ...userBaseFields,
  status: v.literal('deletion_failed'),
  authId: v.string(),
  deletingAt: v.number(),
  delete: userDeleteInfo,
  email: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  profilePictureUrl: v.optional(v.string()),
});

const deletedUser = v.object({
  ...userBaseFields,
  status: v.literal('deleted'),
  deletedAt: v.number(),
  purgeAt: v.number(),
  authId: v.optional(v.string()),
  email: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  profilePictureUrl: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable(v.union(activeUser, deletingUser, deletionFailedUser, deletedUser))
    .index('by_authId', ['authId'])
    .index('by_email', ['email'])
    .index('by_status', ['status']),

  workspaces: defineTable({
    name: v.string(),
    createdByUserId: v.id('users'),
    updatedAt: v.number(),
    creatorDisplayNameSnapshot: v.optional(v.string()),
    creatorDisplayEmailSnapshot: v.string(),
  }).index('by_name', ['name']),

  workspaceMembers: defineTable({
    userId: v.id('users'),
    workspaceId: v.id('workspaces'),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_userId', ['workspaceId', 'userId']),

  workspaceInvites: defineTable({
    workspaceId: v.id('workspaces'),
    email: v.string(),
    role: v.union(v.literal('admin'), v.literal('member')),
    token: v.string(),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('revoked')),
    invitedByUserId: v.id('users'),
    invitedUserId: v.optional(v.id('users')),
    expiresAt: v.number(),
    acceptedByUserId: v.optional(v.id('users')),
    acceptedAt: v.optional(v.number()),
    updatedAt: v.number(),
    inviterDisplayNameSnapshot: v.optional(v.string()),
    inviterDisplayEmailSnapshot: v.string(),
  })
    .index('by_token', ['token'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_email', ['workspaceId', 'email'])
    .index('by_email', ['email'])
    .index('by_invitedUserId', ['invitedUserId']),

  workspaceBillingState: defineTable({
    workspaceId: v.id('workspaces'),
    planKey: v.union(v.literal('free'), v.literal('pro_monthly'), v.literal('pro_yearly')),
    status: v.union(
      v.literal('none'),
      v.literal('trialing'),
      v.literal('active'),
      v.literal('past_due'),
      v.literal('canceled'),
    ),
    periodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    providerCustomerId: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_providerSubscriptionId', ['providerSubscriptionId']),

  billingEvents: defineTable({
    providerEventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
    handledAt: v.optional(v.number()),
    workspaceId: v.optional(v.id('workspaces')),
    status: v.union(
      v.literal('received'),
      v.literal('handled'),
      v.literal('error'),
      v.literal('unresolved'),
    ),
    error: v.optional(v.string()),
  })
    .index('by_providerEventId', ['providerEventId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_status', ['status']),
});
