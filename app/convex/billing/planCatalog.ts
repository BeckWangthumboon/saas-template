import { ConvexError } from 'convex/values';

export type PlanKey = 'free' | 'pro_monthly' | 'pro_yearly';
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

const requireEnv = (value: string | undefined, name: string): string => {
  if (value === undefined || value.trim().length === 0) {
    throw new ConvexError(`${name} environment variable is not set`);
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
  throw new ConvexError('POLAR product IDs must be unique');
}

export const PRODUCT_ID_TO_PLAN_KEY: Record<string, PlanKey | undefined> = {
  [PRO_MONTHLY_PRODUCT_ID]: 'pro_monthly',
  [PRO_YEARLY_PRODUCT_ID]: 'pro_yearly',
};

export const resolvePlanKeyFromProductId = (
  productId?: string | null,
): PlanKey => {
  if (!productId) {
    throw new ConvexError('Polar product ID is required');
  }
  const planKey = PRODUCT_ID_TO_PLAN_KEY[productId];
  if (!planKey) {
    throw new ConvexError(`Unknown Polar product ID: ${productId}`);
  }
  return planKey;
};
