import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
  })
    .index('by_authId', ['authId'])
    .index('by_email', ['email']),

  workspaces: defineTable({
    name: v.string(),
  }).index('by_name', ['name']),

  workspaceMembers: defineTable({
    userId: v.id('users'),
    workspaceId: v.id('workspaces'),
  })
    .index('by_userId', ['userId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_userId', ['workspaceId', 'userId']),
});
