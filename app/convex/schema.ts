import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    onboardingStatus: v.union(v.literal('not_started'), v.literal('completed')),
    updatedAt: v.number(),
  })
    .index('by_authId', ['authId'])
    .index('by_email', ['email']),

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
  })
    .index('by_token', ['token'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_email', ['workspaceId', 'email'])
    .index('by_email', ['email']),
});
