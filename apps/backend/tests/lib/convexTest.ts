import actionRetrierTest from '@convex-dev/action-retrier/test';
import r2Test from '@convex-dev/r2/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import resendTest from '@convex-dev/resend/test';
import workosAuthKitTest from '@convex-dev/workos-authkit/test';
import workpoolTest from '@convex-dev/workpool/test';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.ts');

export const createConvexTest = () => {
  const t = convexTest(schema, modules);
  actionRetrierTest.register(t);
  rateLimiterTest.register(t);
  r2Test.register(t);
  resendTest.register(t);
  workpoolTest.register(t, 'workosWorkpool');
  workpoolTest.register(t, 'r2CleanupWorkpool');
  workosAuthKitTest.register(t, 'workOSAuthKit');
  return t;
};
