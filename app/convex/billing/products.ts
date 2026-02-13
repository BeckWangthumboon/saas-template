import { ErrorCode } from '../../shared/errors';
import type { PlanKey } from '../entitlements/types';
import { convexEnv } from '../env';
import { throwAppErrorForConvex } from '../errors';

const PRO_MONTHLY_PRODUCT_ID = convexEnv.polarProMonthlyProductId;
const PRO_YEARLY_PRODUCT_ID = convexEnv.polarProYearlyProductId;

export const PLAN_KEY_TO_PRODUCT_ID = {
  free: null,
  pro_monthly: PRO_MONTHLY_PRODUCT_ID,
  pro_yearly: PRO_YEARLY_PRODUCT_ID,
} as const satisfies Record<PlanKey, string | null>;

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
