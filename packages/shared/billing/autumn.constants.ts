import { AUTUMN_PLAN_IDS } from './autumn.ids';

export const AUTUMN_PLAN_PRICES_USD = {
  proMonthly: 10,
  proYearly: 120,
} as const;

export const PLAN_KEY_TO_AUTUMN_PLAN_ID = {
  free: AUTUMN_PLAN_IDS.free,
  pro_monthly: AUTUMN_PLAN_IDS.proMonthly,
  pro_yearly: AUTUMN_PLAN_IDS.proYearly,
} as const;
