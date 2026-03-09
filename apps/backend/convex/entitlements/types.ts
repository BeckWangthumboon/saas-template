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
  v.literal('scheduled'),
  v.literal('expired'),
);

export const planTierValidator = v.union(v.literal('free'), v.literal('pro'));

export const workspaceUsageValidator = v.object({
  memberCount: v.number(),
  ownerCount: v.number(),
  pendingInviteCount: v.number(),
});

export const workspaceEntitlementsSummaryValidator = v.object({
  workspaceId: v.id('workspaces'),
  usage: workspaceUsageValidator,
});

export type PlanKey = Infer<typeof planKeyValidator>;
export type BillingStatus = Infer<typeof billingStatusValidator>;
export type PlanTier = Infer<typeof planTierValidator>;
export type WorkspaceUsage = Infer<typeof workspaceUsageValidator>;
export type WorkspaceEntitlementsSummary = Infer<typeof workspaceEntitlementsSummaryValidator>;
