import type { FunctionReturnType } from 'convex/server';
import { createContext, useContext, useMemo } from 'react';

import { type ActionState, useConvexAction, useConvexQuery } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { AppErrorData } from '../../../shared/errors';

type BillingSummary = FunctionReturnType<typeof api.billing.index.getWorkspaceBillingSummary>;
type CheckoutResponse = FunctionReturnType<typeof api.billing.index.startCheckout>;
type BillingPortalResponse = FunctionReturnType<
  typeof api.billing.index.createBillingPortalSession
>;
type PaidPlanKey = 'pro_monthly' | 'pro_yearly';
type WorkspaceRole = 'owner' | 'admin' | 'member';

interface BillingContextValue {
  status: 'loading' | 'ready';
  billing: BillingSummary | undefined;
  canManageBilling: boolean;
  checkoutState: ActionState<CheckoutResponse>;
  portalState: ActionState<BillingPortalResponse>;
  startCheckout: (
    planKey: PaidPlanKey,
  ) => Promise<{ ok: true; data: CheckoutResponse } | { ok: false; error: AppErrorData }>;
  createPortalSession: () => Promise<
    { ok: true; data: BillingPortalResponse } | { ok: false; error: AppErrorData }
  >;
}

const BillingContext = createContext<BillingContextValue | null>(null);

/**
 * Hook to access billing state and checkout actions.
 * Must be used within a BillingProvider.
 *
 * @throws Error if used outside of BillingProvider.
 */
export function useBilling(): BillingContextValue {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error('useBilling must be used within a BillingProvider');
  }
  return context;
}

interface BillingProviderProps {
  children: React.ReactNode;
  workspaceId: Id<'workspaces'>;
  role: WorkspaceRole;
}

/**
 * Provides workspace billing summary and checkout/portal actions.
 * This provider is intentionally scoped to billing workflows and does not
 * expose any entitlement checks.
 */
export function BillingProvider({ children, workspaceId, role }: BillingProviderProps) {
  const { status, data } = useConvexQuery(api.billing.index.getWorkspaceBillingSummary, {
    workspaceId,
  });
  const { execute: executeCheckout, state: checkoutState } = useConvexAction(
    api.billing.index.startCheckout,
  );
  const { execute: executeCreatePortalSession, state: portalState } = useConvexAction(
    api.billing.index.createBillingPortalSession,
  );

  const canManageBilling = role === 'owner' || role === 'admin';

  const value = useMemo<BillingContextValue>(() => {
    const startCheckout: BillingContextValue['startCheckout'] = async (planKey) => {
      const result = await executeCheckout({ workspaceId, planKey });
      return result.isOk() ? { ok: true, data: result.value } : { ok: false, error: result.error };
    };

    const createPortalSession: BillingContextValue['createPortalSession'] = async () => {
      const result = await executeCreatePortalSession({ workspaceId });
      return result.isOk() ? { ok: true, data: result.value } : { ok: false, error: result.error };
    };

    return {
      status: status === 'success' ? 'ready' : 'loading',
      billing: data,
      canManageBilling,
      checkoutState,
      portalState,
      startCheckout,
      createPortalSession,
    };
  }, [
    canManageBilling,
    checkoutState,
    data,
    executeCheckout,
    executeCreatePortalSession,
    portalState,
    status,
    workspaceId,
  ]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}
