import { api } from '@saas/convex-api';
import { useNavigate } from '@tanstack/react-router';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import { useConvexQuery } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';

export interface Workspace {
  id: string;
  workspaceKey: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

interface WorkspaceContextBase {
  workspaces: Workspace[];
  /**
   * Builds a full path for a workspace-scoped route.
   * @param subpath - Optional subpath (e.g., '/settings/account')
   * @returns Full path (e.g., '/w/k7m2q9tx/settings/account')
   */
  getWorkspacePath: (subpath?: string) => string;
}

export type WorkspaceReadyContext = WorkspaceContextBase & {
  status: 'ready';
  workspace: Workspace;
  workspaceId: string;
  workspaceKey: string;
  role: Workspace['role'];
};

export type WorkspaceContextValue =
  | (WorkspaceContextBase & { status: 'loading' })
  | (WorkspaceContextBase & { status: 'redirecting' })
  | (WorkspaceContextBase & { status: 'empty' })
  | WorkspaceReadyContext;

export function isWorkspaceReady(context: WorkspaceContextValue) {
  return context.status === 'ready';
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Hook to access the current workspace context.
 * Must be used within a WorkspaceProvider.
 * @throws Error if used outside of WorkspaceProvider
 */
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

interface WorkspaceProviderProps {
  children: React.ReactNode;
  workspaceKey: string | null;
}

/**
 * Provides workspace context to all child components.
 * Handles data fetching, persistence, and invalid workspace redirection.
 * Exposes loading state for consumers to render their own loading UI.
 */
export function WorkspaceProvider({ children, workspaceKey }: WorkspaceProviderProps) {
  const navigate = useNavigate();

  const { status, data } = useConvexQuery(api.workspaces.index.getUserWorkspaces);
  const workspaces = useMemo(() => data ?? [], [data]);
  const workspace = useMemo(
    () => (workspaceKey ? workspaces.find((w) => w.workspaceKey === workspaceKey) : undefined),
    [workspaces, workspaceKey],
  );

  // Handle redirection for invalid workspaceKey
  useEffect(() => {
    if (status !== 'success') return;

    if (!workspace) {
      const lastWorkspaceKey = defaultWorkspaceStorage.get();
      const lastWorkspace = lastWorkspaceKey
        ? workspaces.find((w) => w.workspaceKey === lastWorkspaceKey)
        : undefined;

      if (lastWorkspace) {
        void navigate({ to: `/w/${lastWorkspace.workspaceKey}` });
      } else if (workspaces.length > 0) {
        void navigate({ to: `/w/${workspaces[0].workspaceKey}` });
      } else {
        void navigate({ to: '/' });
      }
      return;
    }

    defaultWorkspaceStorage.set(workspace.workspaceKey);
  }, [status, workspace, workspaces, workspaceKey, navigate]);

  const getWorkspacePath = useCallback(
    (subpath?: string): string => {
      const base = workspaceKey ? `/w/${workspaceKey}` : '/w';
      if (!subpath) return base;
      const normalizedSubpath = subpath.startsWith('/') ? subpath : `/${subpath}`;
      return `${base}${normalizedSubpath}`;
    },
    [workspaceKey],
  );

  const baseValue = { workspaces, getWorkspacePath };
  let value: WorkspaceContextValue;

  if (status === 'loading') {
    value = { status: 'loading', ...baseValue };
  } else if (workspaces.length === 0) {
    value = { status: 'empty', ...baseValue };
  } else if (!workspace) {
    value = { status: 'redirecting', ...baseValue };
  } else {
    value = {
      status: 'ready',
      workspace,
      workspaceId: workspace.id,
      workspaceKey: workspace.workspaceKey,
      role: workspace.role,
      ...baseValue,
    };
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
