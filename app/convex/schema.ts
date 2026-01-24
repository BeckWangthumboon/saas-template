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
  })
    .index('by_userId', ['userId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_userId', ['workspaceId', 'userId']),
});
