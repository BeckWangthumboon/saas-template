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

const trackedProduct = v.object({
  workspaceId: v.id('workspaces'),
  status: v.union(v.literal('active'), v.literal('archived')),
  name: v.string(),
  brand: v.string(),
  product: v.string(),
  latestRunId: v.optional(v.id('runs')),
  updatedAt: v.number(),
});

const runStatus = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('canceled'),
);

const runCurrentStage = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('canceled'),
);

const queryFacet = v.union(
  v.literal('generic'),
  v.literal('target_customer'),
  v.literal('use_case'),
  v.literal('differentiator'),
  v.literal('competitor'),
  v.literal('mixed'),
);

const queryStatus = v.union(
  v.literal('pending'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('skipped'),
);

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
    providerSubscriptionUpdatedAt: v.optional(v.number()),
    pastDueAt: v.optional(v.number()),
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

  trackedProducts: defineTable(trackedProduct)
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_status', ['workspaceId', 'status'])
    .index('by_workspaceId_updatedAt', ['workspaceId', 'updatedAt']),

  runs: defineTable({
    workspaceId: v.id('workspaces'),
    trackedProductId: v.id('trackedProducts'),
    status: runStatus,
    triggerType: v.union(v.literal('baseline'), v.literal('scheduled'), v.literal('manual')),
    providerName: v.string(),
    model: v.string(),
    currentStage: runCurrentStage,
    workflowId: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    errorSummary: v.optional(v.string()),
    totalQueries: v.number(),
    completedQueries: v.number(),
    failedQueries: v.number(),
    updatedAt: v.number(),
  })
    .index('by_trackedProductId', ['trackedProductId'])
    .index('by_trackedProductId_status', ['trackedProductId', 'status'])
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_status', ['workspaceId', 'status'])
    .index('by_workflowId', ['workflowId']),

  runQueries: defineTable({
    runId: v.id('runs'),
    workspaceId: v.id('workspaces'),
    trackedProductId: v.id('trackedProducts'),
    position: v.number(),
    prompt: v.string(),
    facet: queryFacet,
    status: queryStatus,
    attemptCount: v.number(),
    providerName: v.string(),
    model: v.string(),
    error: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_runId', ['runId'])
    .index('by_runId_status', ['runId', 'status'])
    .index('by_runId_position', ['runId', 'position'])
    .index('by_trackedProductId', ['trackedProductId']),
});
