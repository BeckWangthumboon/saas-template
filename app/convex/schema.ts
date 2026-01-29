import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const userDeleteInfo = v.optional(
  v.object({
    lastAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    workId: v.optional(v.string()),
  }),
);

const userBaseFields = {
  onboardingStatus: v.union(v.literal('not_started'), v.literal('completed')),
  updatedAt: v.number(),
  delete: userDeleteInfo,
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
  users: defineTable(v.union(activeUser, deletingUser, deletedUser))
    .index('by_authId', ['authId'])
    .index('by_email', ['email'])
    .index('by_status', ['status']),

  workspaces: defineTable({
    name: v.string(),
    createdByUserId: v.id('users'),
    updatedAt: v.number(),
  }).index('by_name', ['name']),

  workspaceMembers: defineTable({
    userId: v.id('users'),
    workspaceId: v.id('workspaces'),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
    status: v.union(v.literal('active'), v.literal('invited')),
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
    .index('by_email', ['email']),
});
