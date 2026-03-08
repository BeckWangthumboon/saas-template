import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import type { FunctionReturnType } from 'convex/server';
import { createContext, useContext, useMemo } from 'react';

import { useConvexQuery } from '@/hooks';

type WorkspaceEntitlementsSummary = FunctionReturnType<
  typeof api.entitlements.index.getWorkspaceEntitlements
>;

export type WorkspaceEntitlementsContextValue =
  | { status: 'loading' }
  | {
      status: 'ready';
      entitlements: WorkspaceEntitlementsSummary;
    };

const WorkspaceEntitlementsContext = createContext<WorkspaceEntitlementsContextValue | null>(null);

/**
 * Returns true when workspace entitlements have been fully resolved.
 */
export function isWorkspaceEntitlementsReady(
  value: WorkspaceEntitlementsContextValue,
): value is Extract<WorkspaceEntitlementsContextValue, { status: 'ready' }> {
  return value.status === 'ready';
}

/**
 * Reads workspace entitlement state.
 * Must be used inside WorkspaceEntitlementsProvider.
 */
export function useWorkspaceEntitlements(): WorkspaceEntitlementsContextValue {
  const context = useContext(WorkspaceEntitlementsContext);
  if (!context) {
    throw new Error('useWorkspaceEntitlements must be used within a WorkspaceEntitlementsProvider');
  }
  return context;
}

interface WorkspaceEntitlementsProviderProps {
  children: React.ReactNode;
  workspaceId: Id<'workspaces'>;
}

/**
 * Provides local workspace usage derived from Convex data.
 */
export function WorkspaceEntitlementsProvider({
  children,
  workspaceId,
}: WorkspaceEntitlementsProviderProps) {
  const { status, data } = useConvexQuery(api.entitlements.index.getWorkspaceEntitlements, {
    workspaceId,
  });

  const value = useMemo<WorkspaceEntitlementsContextValue>(() => {
    if (status !== 'success') {
      return { status: 'loading' };
    }

    return {
      status: 'ready',
      entitlements: data,
    };
  }, [data, status]);

  return (
    <WorkspaceEntitlementsContext.Provider value={value}>
      {children}
    </WorkspaceEntitlementsContext.Provider>
  );
}
