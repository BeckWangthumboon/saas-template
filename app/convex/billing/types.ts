import type { Infer } from 'convex/values';
import { v } from 'convex/values';

export const planKeyValidator = v.union(
  v.literal('free'),
  v.literal('pro_monthly'),
  v.literal('pro_yearly'),
);

export const paidPlanKeyValidator = v.union(v.literal('pro_monthly'), v.literal('pro_yearly'));

export const billingStatusValidator = v.union(
  v.literal('none'),
  v.literal('trialing'),
  v.literal('active'),
  v.literal('past_due'),
  v.literal('canceled'),
);

export const planTierValidator = v.union(v.literal('free'), v.literal('pro'));

export const billingStateValidator = v.object({
  workspaceId: v.id('workspaces'),
  planKey: planKeyValidator,
  status: billingStatusValidator,
  periodEnd: v.optional(v.number()),
  cancelAtPeriodEnd: v.optional(v.boolean()),
  providerCustomerId: v.optional(v.string()),
  providerSubscriptionId: v.optional(v.string()),
  providerSubscriptionUpdatedAt: v.optional(v.number()),
  pastDueAt: v.optional(v.number()),
  updatedAt: v.number(),
});

export const billingSummaryValidator = v.object({
  workspaceId: v.id('workspaces'),
  planKey: planKeyValidator,
  tier: planTierValidator,
  status: billingStatusValidator,
  effectiveStatus: billingStatusValidator,
  periodEnd: v.optional(v.number()),
  cancelAtPeriodEnd: v.optional(v.boolean()),
  pastDueAt: v.optional(v.number()),
  graceEndsAt: v.optional(v.number()),
  isInGrace: v.boolean(),
  updatedAt: v.number(),
});

export type BillingState = Infer<typeof billingStateValidator>;
export type BillingSummary = Infer<typeof billingSummaryValidator>;
export type PlanKeyFromValidator = Infer<typeof planKeyValidator>;
export type PaidPlanKeyFromValidator = Infer<typeof paidPlanKeyValidator>;
export type BillingStatusFromValidator = Infer<typeof billingStatusValidator>;
export type PlanTierFromValidator = Infer<typeof planTierValidator>;
