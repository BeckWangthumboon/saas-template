import type { api } from '@saas/convex-api';
import type { AppErrorData } from '@saas/shared/errors';
import type { FunctionReturnType } from 'convex/server';
import { createContext, type ReactNode, useContext } from 'react';

type WorkspaceRole = 'owner' | 'admin' | 'member';

export type BillingSummary = FunctionReturnType<
  typeof api.billing.index.getWorkspaceBillingSummary
>;

export type BillingState =
  | { status: 'ready'; billing: BillingSummary }
  | { status: 'error'; error: AppErrorData };

type BillingContextValue =
  | ({ status: 'ready'; billing: BillingSummary } & { canManageBilling: boolean })
  | ({ status: 'error'; error: AppErrorData } & { canManageBilling: boolean });

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
  children: ReactNode;
  role: WorkspaceRole;
  state: BillingState;
}

/**
 * Provides loader-backed billing state to billing UI without fetching inside the provider.
 */
export function BillingProvider({ children, role, state }: BillingProviderProps) {
  const canManageBilling = role === 'owner' || role === 'admin';

  return (
    <BillingContext.Provider value={{ ...state, canManageBilling }}>
      {children}
    </BillingContext.Provider>
  );
}
