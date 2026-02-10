import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';
import type { PlanKey } from '../entitlements/types';

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

/**
 * Maps a Polar product ID to a valid internal plan key.
 */
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
