import type { Id } from '@saas/convex-api';
import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { FilesIcon, LayoutDashboardIcon, SettingsIcon, UsersIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  isWorkspaceEntitlementsReady,
  isWorkspaceReady,
  useWorkspace,
  useWorkspaceEntitlements,
  WorkspaceEntitlementsProvider,
  WorkspaceProvider,
  type WorkspaceReadyContext,
  WorkspaceSwitcher,
} from '@/features/workspaces';
import { cn } from '@/lib/utils';

interface AppPage {
  label: string;
  href: string;
  icon: typeof LayoutDashboardIcon;
  match?: (path: string) => boolean;
}

export const Route = createFileRoute('/_app/workspaces/$workspaceId')({
  component: WorkspaceLayout,
});

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: typeof LayoutDashboardIcon;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}

function WorkspaceLayout() {
  const { workspaceId } = Route.useParams();
  const { pathname } = useLocation();
  return (
    <WorkspaceProvider key={pathname} workspaceId={workspaceId}>
      <WorkspaceLayoutContent />
    </WorkspaceProvider>
  );
}

function WorkspaceLayoutContent() {
  const workspaceContext = useWorkspace();
  if (!isWorkspaceReady(workspaceContext)) {
    const message =
      workspaceContext.status === 'empty' ? 'No workspaces found.' : 'Loading workspace...';
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <WorkspaceEntitlementsProvider workspaceId={workspaceContext.workspaceId as Id<'workspaces'>}>
      <WorkspaceLayoutReadyContent workspaceContext={workspaceContext} />
    </WorkspaceEntitlementsProvider>
  );
}

function WorkspaceLayoutReadyContent({
  workspaceContext,
}: {
  workspaceContext: WorkspaceReadyContext;
}) {
  const navigate = Route.useNavigate();
  const entitlementsContext = useWorkspaceEntitlements();
  const location = useLocation();
  const isEntitlementsReady = isWorkspaceEntitlementsReady(entitlementsContext);
  const { workspaces, getWorkspacePath, workspace } = workspaceContext;

  const workspaceBasePath = getWorkspacePath();
  const settingsPath = getWorkspacePath('/settings');
  const membersPath = getWorkspacePath('/members');
  const contactsPath = getWorkspacePath('/contacts');
  const filesPath = getWorkspacePath('/files');
  const billingPath = getWorkspacePath('/settings/billing');
  const isWorkspaceScopedPath =
    location.pathname === workspaceBasePath ||
    location.pathname.startsWith(`${workspaceBasePath}/`);
  const isLockedWorkspace =
    isEntitlementsReady && entitlementsContext.entitlements.lifecycle.isLocked;
  const isPathAllowedWhenLocked =
    location.pathname === membersPath || location.pathname.startsWith(settingsPath);
  const isBlockedByLock = isLockedWorkspace && isWorkspaceScopedPath && !isPathAllowedWhenLocked;

  if (!isEntitlementsReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  const appPages: AppPage[] = [];

  appPages.push({
    label: 'Overview',
    href: getWorkspacePath(),
    icon: LayoutDashboardIcon,
  });

  appPages.push({
    label: 'Contacts',
    href: contactsPath,
    icon: UsersIcon,
  });

  appPages.push({
    label: 'Files',
    href: filesPath,
    icon: FilesIcon,
  });

  if (entitlementsContext.canAccessMembersPage) {
    appPages.push({
      label: 'Members',
      href: membersPath,
      icon: UsersIcon,
    });
  }

  appPages.push({
    label: 'Settings',
    href: getWorkspacePath('/settings/workspace'),
    icon: SettingsIcon,
    match: (path: string) => path.startsWith(getWorkspacePath('/settings')),
  });

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="w-56 shrink-0 border-r bg-muted/40 p-3 flex flex-col">
        <nav className="flex flex-col gap-1 flex-1">
          {appPages.map((page) => (
            <NavItem
              key={page.href}
              href={page.href}
              icon={page.icon}
              label={page.label}
              isActive={
                page.match ? page.match(location.pathname) : location.pathname === page.href
              }
            />
          ))}
        </nav>
        <div className="border-t pt-3 mt-3">
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentWorkspace={workspace}
            onNavigate={navigate}
          />
        </div>
      </aside>

      <main className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-6">
            {isBlockedByLock ? (
              <div className="flex min-h-[70vh] items-center justify-center">
                <LockedWorkspaceAccessPanel
                  onGoToBilling={() => {
                    void navigate({ to: billingPath });
                  }}
                />
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function LockedWorkspaceAccessPanel({ onGoToBilling }: { onGoToBilling: () => void }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Workspace access limited</h1>
        <p className="text-muted-foreground text-sm">
          This workspace is locked due to a billing issue. Resolve billing to restore full access.
        </p>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button
          onClick={() => {
            onGoToBilling();
          }}
        >
          Go to billing
        </Button>
      </div>
    </div>
  );
}
