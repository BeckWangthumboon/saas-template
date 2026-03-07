import { feature, item, plan } from 'atmn';

import { AUTUMN_PLAN_PRICES_USD } from './autumn.constants';
import { AUTUMN_FEATURE_IDS, AUTUMN_PLAN_IDS } from './autumn.ids';

export const invites = feature({
  id: AUTUMN_FEATURE_IDS.invites,
  name: 'Invites',
  type: 'boolean',
});

export const team_members = feature({
  id: AUTUMN_FEATURE_IDS.teamMembers,
  name: 'Team members',
  type: 'boolean',
});

export const free = plan({
  id: AUTUMN_PLAN_IDS.free,
  name: 'Free',
  autoEnable: true,
  items: [],
});

export const pro_monthly = plan({
  id: AUTUMN_PLAN_IDS.proMonthly,
  name: 'Pro Monthly',
  price: {
    amount: AUTUMN_PLAN_PRICES_USD.proMonthly,
    interval: 'month',
  },
  items: [
    item({
      featureId: invites.id,
    }),
    item({
      featureId: team_members.id,
    }),
  ],
});

export const pro_yearly = plan({
  id: AUTUMN_PLAN_IDS.proYearly,
  name: 'Pro Yearly',
  price: {
    amount: AUTUMN_PLAN_PRICES_USD.proYearly,
    interval: 'year',
  },
  items: [
    item({
      featureId: invites.id,
    }),
    item({
      featureId: team_members.id,
    }),
  ],
});
