import { createAppErrorForConvex, ErrorCode } from '../../shared/errors';

export type PlanKey = 'free' | 'pro_monthly' | 'pro_yearly';
export type FeatureKey = 'team_members';
export type LimitKey = 'members' | 'workspaces';

export type PlanFeatures = Record<FeatureKey, boolean>;
export type PlanLimits = Record<LimitKey, number | null>;

export interface PlanDefinition {
  features: PlanFeatures;
  limits: PlanLimits;
}

// Shared entitlements for all pro plans.
const PRO_PLAN = {
  features: {
    team_members: true,
  },
  limits: {
    members: 50,
    workspaces: null,
  },
} as const satisfies PlanDefinition;

// Plan definitions keyed by billing plan.
export const PLAN_CATALOG = {
  free: {
    features: {
      team_members: false,
    },
    limits: {
      members: 1,
      workspaces: 1,
    },
  },
  pro_monthly: PRO_PLAN,
  pro_yearly: PRO_PLAN,
} as const satisfies Record<PlanKey, PlanDefinition>;

// Default plan for new workspaces.
export const DEFAULT_PLAN_KEY: PlanKey = 'free';

/**
 * Ensures a required environment variable is set.
 */
const requireEnv = (value: string | undefined, name: string): string => {
  if (value === undefined || value === '') {
    throw createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: `${name} environment variable is not set`,
    });
  }
  return value;
};

// Polar product ID for the pro monthly plan.
const PRO_MONTHLY_PRODUCT_ID = requireEnv(
  process.env.POLAR_PRO_MONTHLY_PRODUCT_ID,
  'POLAR_PRO_MONTHLY_PRODUCT_ID',
);
// Polar product ID for the pro yearly plan.
const PRO_YEARLY_PRODUCT_ID = requireEnv(
  process.env.POLAR_PRO_YEARLY_PRODUCT_ID,
  'POLAR_PRO_YEARLY_PRODUCT_ID',
);

/**
 * Maps internal plan keys to their corresponding Polar product IDs (null for free plans).
 *
 * Note: We are product-based for now. If you later need multiple price IDs per plan,
 * resolve the product by price ID during checkout/webhook handling.
 */
export const PLAN_KEY_TO_PRODUCT_ID = {
  free: null,
  pro_monthly: PRO_MONTHLY_PRODUCT_ID,
  pro_yearly: PRO_YEARLY_PRODUCT_ID,
} as const satisfies Record<PlanKey, string | null>;

/**
 * Reverse mapping from Polar product IDs to internal plan keys.
 */
export const PRODUCT_ID_TO_PLAN_KEY = Object.entries(PLAN_KEY_TO_PRODUCT_ID).reduce<
  Record<string, PlanKey>
>((acc, [planKey, productId]) => {
  if (productId) {
    acc[productId] = planKey as PlanKey;
  }
  return acc;
}, {});

/**
 * Resolves the internal plan key from a Polar product ID.
 */
export const resolvePlanKeyFromProductId = (productId?: string | null): PlanKey | null => {
  if (!productId) {
    return null;
  }
  return PRODUCT_ID_TO_PLAN_KEY[productId] ?? null;
};
