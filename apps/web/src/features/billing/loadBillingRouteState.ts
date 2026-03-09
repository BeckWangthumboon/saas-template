import { api } from '@saas/convex-api';
import type { AppErrorData } from '@saas/shared/errors';
import { ErrorCode, parseAppError } from '@saas/shared/errors';

import type { AppRouterContext } from '@/lib/routerContext';

import type { BillingState } from './BillingContext';

const createInternalBillingError = (message: string): AppErrorData => ({
  code: ErrorCode.INTERNAL_ERROR,
  category: 'INTERNAL',
  message,
  timestamp: new Date().toISOString(),
});

export async function loadBillingRouteState(
  context: AppRouterContext,
  workspaceKey: string,
): Promise<BillingState> {
  try {
    const billing = await context.convexClient.action(
      api.billing.index.getWorkspaceBillingSummary,
      {
        workspaceKey,
      },
    );

    return {
      status: 'ready',
      billing,
    };
  } catch (error: unknown) {
    return {
      status: 'error',
      error:
        parseAppError(error) ??
        createInternalBillingError(
          error instanceof Error ? error.message : 'Unable to load billing details',
        ),
    };
  }
}
