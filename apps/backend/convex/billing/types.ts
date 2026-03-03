import type { Infer } from 'convex/values';
import { v } from 'convex/values';

import {
  type BillingStatus,
  billingStatusValidator,
  type PlanKey,
  planKeyValidator,
  type PlanTier,
  planTierValidator,
} from '../entitlements/types';

export const paidPlanKeyValidator = v.union(v.literal('pro_monthly'), v.literal('pro_yearly'));

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
export type PlanKeyFromValidator = PlanKey;
export type PaidPlanKeyFromValidator = Infer<typeof paidPlanKeyValidator>;
export type BillingStatusFromValidator = BillingStatus;
export type PlanTierFromValidator = PlanTier;
