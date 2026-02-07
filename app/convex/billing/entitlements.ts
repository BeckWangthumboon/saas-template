import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';
import type { PlanKeyFromValidator, PlanTierFromValidator } from './types';

export type PlanKey = PlanKeyFromValidator;
export type PlanTier = PlanTierFromValidator;
export type FeatureKey = 'team_members';
export type LimitKey = 'members' | 'invites' | 'workspaces';
export type BillingInterval = 'month' | 'year';

export type PlanFeatures = Record<FeatureKey, boolean>;
export type PlanLimits = Record<LimitKey, number | null>;

export interface PlanDefinition {
  features: PlanFeatures;
  limits: PlanLimits;
  billingInterval: BillingInterval | null;
}

const PRO_FEATURES = {
  team_members: true,
} as const satisfies PlanFeatures;

const PRO_LIMITS = {
  members: 50,
  invites: null,
  workspaces: null,
} as const satisfies PlanLimits;

export const PLAN_CATALOG = {
  free: {
    features: {
      team_members: false,
    },
    limits: {
      members: 1,
      invites: 0,
      workspaces: 1,
    },
    billingInterval: null,
  },
  pro_monthly: {
    features: PRO_FEATURES,
    limits: PRO_LIMITS,
    billingInterval: 'month',
  },
  pro_yearly: {
    features: PRO_FEATURES,
    limits: PRO_LIMITS,
    billingInterval: 'year',
  },
} as const satisfies Record<PlanKey, PlanDefinition>;

export const DEFAULT_PLAN_KEY: PlanKey = 'free';

export const getPlanDefinition = (planKey: PlanKey): PlanDefinition => {
  return PLAN_CATALOG[planKey];
};

export const getPlanTier = (planKey: PlanKey): PlanTier => {
  return planKey === 'free' ? 'free' : 'pro';
};

export const getPlanEntitlements = (planKey: PlanKey) => {
  const { features, limits, billingInterval } = getPlanDefinition(planKey);
  return { features, limits, billingInterval };
};

const requireEnv = (value: string | undefined, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: `${name} environment variable is not set`,
    });
  }
  return value;
};

const PRO_MONTHLY_PRODUCT_ID = requireEnv(
  process.env.POLAR_PRO_MONTHLY_PRODUCT_ID,
  'POLAR_PRO_MONTHLY_PRODUCT_ID',
);
const PRO_YEARLY_PRODUCT_ID = requireEnv(
  process.env.POLAR_PRO_YEARLY_PRODUCT_ID,
  'POLAR_PRO_YEARLY_PRODUCT_ID',
);

export const PLAN_KEY_TO_PRODUCT_ID = {
  free: null,
  pro_monthly: PRO_MONTHLY_PRODUCT_ID,
  pro_yearly: PRO_YEARLY_PRODUCT_ID,
} as const satisfies Record<PlanKey, string | null>;

if (PRO_MONTHLY_PRODUCT_ID === PRO_YEARLY_PRODUCT_ID) {
  throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
    details: 'POLAR product IDs must be unique',
  });
}

export const PRODUCT_ID_TO_PLAN_KEY: Record<string, PlanKey | undefined> = {
  [PRO_MONTHLY_PRODUCT_ID]: 'pro_monthly',
  [PRO_YEARLY_PRODUCT_ID]: 'pro_yearly',
};

export const resolvePlanKeyFromProductId = (productId?: string | null): PlanKey => {
  if (typeof productId !== 'string' || productId.length === 0) {
    return throwAppErrorForConvex(ErrorCode.BILLING_PRODUCT_ID_REQUIRED);
  }
  if (productId === PRO_MONTHLY_PRODUCT_ID) {
    return 'pro_monthly';
  }
  if (productId === PRO_YEARLY_PRODUCT_ID) {
    return 'pro_yearly';
  }
  return throwAppErrorForConvex(ErrorCode.BILLING_PRODUCT_ID_UNKNOWN, { productId });
};
