import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import type { FunctionReturnType } from 'convex/server';
import { createContext, useContext, useMemo } from 'react';

import { useConvexQuery } from '@/hooks';

type BillingSummary = FunctionReturnType<typeof api.billing.index.getWorkspaceBillingSummary>;
type WorkspaceRole = 'owner' | 'admin' | 'member';

interface BillingContextValue {
  status: 'loading' | 'ready';
  billing: BillingSummary | undefined;
  canManageBilling: boolean;
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

  const canManageBilling = role === 'owner' || role === 'admin';

  const value = useMemo<BillingContextValue>(() => {
    return {
      status: status === 'success' ? 'ready' : 'loading',
      billing: data,
      canManageBilling,
    };
  }, [canManageBilling, data, status]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}
