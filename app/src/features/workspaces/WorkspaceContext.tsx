import { useNavigate } from '@tanstack/react-router';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import { useConvexQuery } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';

import { api } from '../../../convex/_generated/api';

export interface Workspace {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

interface WorkspaceContextBase {
  workspaces: Workspace[];
  /**
   * Builds a full path for a workspace-scoped route.
   * @param subpath - Optional subpath (e.g., '/settings/account')
   * @returns Full path (e.g., '/workspaces/abc123/settings/account')
   */
  getWorkspacePath: (subpath?: string) => string;
}

export type WorkspaceReadyContext = WorkspaceContextBase & {
  status: 'ready';
  workspace: Workspace;
  workspaceId: string;
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
  workspaceId: string | null;
}

/**
 * Provides workspace context to all child components.
 * Handles data fetching, persistence, and invalid workspace redirection.
 * Exposes loading state for consumers to render their own loading UI.
 */
export function WorkspaceProvider({ children, workspaceId }: WorkspaceProviderProps) {
  const navigate = useNavigate();

  const { status, data } = useConvexQuery(api.workspace.getUserWorkspaces);
  const workspaces = useMemo(() => data ?? [], [data]);
  const workspace = useMemo(
    () => (workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined),
    [workspaces, workspaceId],
  );

  // Handle redirection for invalid workspaceId
  useEffect(() => {
    if (status !== 'success') return;

    if (!workspace) {
      const lastWorkspaceId = defaultWorkspaceStorage.get();
      const lastWorkspace = lastWorkspaceId
        ? workspaces.find((w) => w.id === lastWorkspaceId)
        : undefined;

      if (lastWorkspace) {
        void navigate({ to: `/workspaces/${lastWorkspace.id}` });
      } else if (workspaces.length > 0) {
        void navigate({ to: `/workspaces/${workspaces[0].id}` });
      } else {
        void navigate({ to: '/' });
      }
      return;
    }

    defaultWorkspaceStorage.set(workspace.id);
  }, [status, workspace, workspaces, workspaceId, navigate]);

  const getWorkspacePath = useCallback(
    (subpath?: string): string => {
      const base = workspaceId ? `/workspaces/${workspaceId}` : '/workspaces';
      if (!subpath) return base;
      const normalizedSubpath = subpath.startsWith('/') ? subpath : `/${subpath}`;
      return `${base}${normalizedSubpath}`;
    },
    [workspaceId],
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
      role: workspace.role,
      ...baseValue,
    };
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
