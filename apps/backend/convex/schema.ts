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

const userAvatarFields = {
  profilePictureUrl: v.optional(v.string()),
  workosProfilePictureUrl: v.optional(v.string()),
  avatarSource: v.union(v.literal('workos'), v.literal('custom')),
  avatarKey: v.optional(v.string()),
};

const deletedUserAvatarFields = {
  profilePictureUrl: v.optional(v.string()),
  workosProfilePictureUrl: v.optional(v.string()),
  avatarSource: v.optional(v.union(v.literal('workos'), v.literal('custom'))),
  avatarKey: v.optional(v.string()),
};

const activeUser = v.object({
  ...userBaseFields,
  status: v.literal('active'),
  authId: v.string(),
  email: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  ...userAvatarFields,
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
  ...userAvatarFields,
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
  ...userAvatarFields,
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
  ...deletedUserAvatarFields,
});

const workspaceBaseFields = {
  name: v.string(),
  workspaceKey: v.string(),
  createdByUserId: v.id('users'),
  updatedAt: v.number(),
  creatorDisplayNameSnapshot: v.optional(v.string()),
  creatorDisplayEmailSnapshot: v.string(),
};

const activeWorkspace = v.object({
  ...workspaceBaseFields,
  status: v.optional(v.literal('active')),
  deletedAt: v.optional(v.number()),
  purgeAt: v.optional(v.number()),
  deletedByUserId: v.optional(v.id('users')),
});

const deletedWorkspace = v.object({
  ...workspaceBaseFields,
  status: v.literal('deleted'),
  deletedAt: v.number(),
  purgeAt: v.number(),
  deletedByUserId: v.id('users'),
});

export default defineSchema({
  users: defineTable(v.union(activeUser, deletingUser, deletionFailedUser, deletedUser))
    .index('by_authId', ['authId'])
    .index('by_email', ['email'])
    .index('by_status', ['status']),

  workspaces: defineTable(v.union(activeWorkspace, deletedWorkspace))
    .index('by_name', ['name'])
    .index('by_workspaceKey', ['workspaceKey'])
    .index('by_status', ['status']),

  workspaceMembers: defineTable({
    userId: v.id('users'),
    workspaceId: v.id('workspaces'),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_userId', ['workspaceId', 'userId']),

  contacts: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdByUserId: v.id('users'),
    updatedAt: v.number(),
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_name', ['workspaceId', 'name']),

  workspaceFiles: defineTable({
    workspaceId: v.id('workspaces'),
    uploadedByUserId: v.id('users'),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.number(),
    key: v.string(),
    updatedAt: v.number(),
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_key', ['workspaceId', 'key'])
    .index('by_key', ['key']),

  uploads: defineTable({
    key: v.string(),
    kind: v.string(),
    requestedByUserId: v.id('users'),
    workspaceId: v.optional(v.id('workspaces')),
    expiresAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_kind_expiresAt', ['kind', 'expiresAt'])
    .index('by_requestedByUserId', ['requestedByUserId'])
    .index('by_workspaceId', ['workspaceId']),

  inviteRequests: defineTable({
    workspaceId: v.id('workspaces'),
    requestedByUserId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('completed'), v.literal('failed')),
    resultInviteId: v.optional(v.id('workspaceInvites')),
    wasResent: v.optional(v.boolean()),
    errorCode: v.optional(v.string()),
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_requestedByUserId', ['requestedByUserId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_status_expiresAt', ['status', 'expiresAt']),

  teamMemberRequests: defineTable({
    workspaceId: v.id('workspaces'),
    requestedByUserId: v.id('users'),
    operation: v.literal('accept_invite'),
    status: v.union(v.literal('pending'), v.literal('completed'), v.literal('failed')),
    resultWorkspaceKey: v.optional(v.string()),
    resultWorkspaceName: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_requestedByUserId', ['requestedByUserId'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_status_expiresAt', ['status', 'expiresAt']),

  r2DeleteQueue: defineTable({
    key: v.string(),
    reason: v.string(),
    source: v.string(),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    workId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_nextAttemptAt', ['nextAttemptAt']),

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

  emailSuppressions: defineTable({
    email: v.string(),
    reason: v.union(v.literal('bounce'), v.literal('spam'), v.literal('manual')),
    source: v.union(v.literal('resend_webhook'), v.literal('manual')),
    eventType: v.optional(v.string()),
    details: v.optional(v.string()),
  })
    .index('by_email', ['email'])
    .index('by_reason', ['reason']),

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
  }).index('by_workspaceId', ['workspaceId']),
});
