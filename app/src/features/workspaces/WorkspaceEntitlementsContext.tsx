import type { FunctionReturnType } from 'convex/server';
import { createContext, useContext, useMemo } from 'react';

import { useConvexQuery } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type WorkspaceEntitlementsSummary = FunctionReturnType<
  typeof api.entitlements.index.getWorkspaceEntitlements
>;

export type WorkspaceEntitlementsContextValue =
  | { status: 'loading' }
  | {
      status: 'ready';
      entitlements: WorkspaceEntitlementsSummary;
      isSoloWorkspace: boolean;
      canAccessMembersPage: boolean;
      canCreateWorkspace: boolean;
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
 * Provides derived workspace entitlement flags for UI gating.
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

    const isSoloWorkspace = data.capabilities.isSoloWorkspace;

    return {
      status: 'ready',
      entitlements: data,
      isSoloWorkspace,
      canAccessMembersPage: !isSoloWorkspace,
      canCreateWorkspace: !isSoloWorkspace,
    };
  }, [data, status]);

  return (
    <WorkspaceEntitlementsContext.Provider value={value}>
      {children}
    </WorkspaceEntitlementsContext.Provider>
  );
}
