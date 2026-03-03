import type { Infer } from 'convex/values';
import { v } from 'convex/values';

export const planKeyValidator = v.union(
  v.literal('free'),
  v.literal('pro_monthly'),
  v.literal('pro_yearly'),
);

export const billingStatusValidator = v.union(
  v.literal('none'),
  v.literal('trialing'),
  v.literal('active'),
  v.literal('past_due'),
  v.literal('canceled'),
);

export const planTierValidator = v.union(v.literal('free'), v.literal('pro'));

export const planFeaturesValidator = v.object({
  team_members: v.boolean(),
});

export const planLimitsValidator = v.object({
  members: v.union(v.number(), v.null()),
  invites: v.union(v.number(), v.null()),
});

export const workspaceUsageValidator = v.object({
  memberCount: v.number(),
  ownerCount: v.number(),
  pendingInviteCount: v.number(),
});

export const entitlementPlanValidator = v.object({
  key: planKeyValidator,
});

export const entitlementLifecycleValidator = v.object({
  status: billingStatusValidator,
  isLocked: v.boolean(),
  isInGrace: v.boolean(),
  graceEndsAt: v.optional(v.number()),
});

export const entitlementCapabilitiesValidator = v.object({
  isSoloWorkspace: v.boolean(),
});

export const workspaceEntitlementsSummaryValidator = v.object({
  workspaceId: v.id('workspaces'),
  plan: entitlementPlanValidator,
  limits: planLimitsValidator,
  usage: workspaceUsageValidator,
  lifecycle: entitlementLifecycleValidator,
  capabilities: entitlementCapabilitiesValidator,
});

export type PlanKey = Infer<typeof planKeyValidator>;
export type BillingStatus = Infer<typeof billingStatusValidator>;
export type PlanTier = Infer<typeof planTierValidator>;
export type PlanFeatures = Infer<typeof planFeaturesValidator>;
export type PlanLimits = Infer<typeof planLimitsValidator>;
export type WorkspaceUsage = Infer<typeof workspaceUsageValidator>;
export type EntitlementPlan = Infer<typeof entitlementPlanValidator>;
export type EntitlementLifecycle = Infer<typeof entitlementLifecycleValidator>;
export type EntitlementCapabilities = Infer<typeof entitlementCapabilitiesValidator>;
export type WorkspaceEntitlementsSummary = Infer<typeof workspaceEntitlementsSummaryValidator>;
