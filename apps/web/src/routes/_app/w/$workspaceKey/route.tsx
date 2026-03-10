import type { Id } from '@saas/convex-api';
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { LayoutDashboardIcon, SettingsIcon, UsersIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  isWorkspaceEntitlementsReady,
  isWorkspaceReady,
  UserActionsMenu,
  useWorkspace,
  useWorkspaceEntitlements,
  WorkspaceEntitlementsProvider,
  WorkspaceProvider,
  type WorkspaceReadyContext,
  WorkspaceSwitcher,
} from '@/features/workspaces';

interface AppPage {
  label: string;
  href: string;
  icon: typeof LayoutDashboardIcon;
  match?: (path: string) => boolean;
}

export const Route = createFileRoute('/_app/w/$workspaceKey')({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { workspaceKey } = Route.useParams();

  return (
    <WorkspaceProvider key={workspaceKey} workspaceKey={workspaceKey}>
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
  const { signOut } = useAuth();
  const navigate = Route.useNavigate();
  const entitlementsContext = useWorkspaceEntitlements();
  const location = useLocation();
  const isEntitlementsReady = isWorkspaceEntitlementsReady(entitlementsContext);
  const { workspaces, getWorkspacePath, workspace } = workspaceContext;

  const workspaceBasePath = getWorkspacePath();
  const settingsPath = getWorkspacePath('/settings');
  const membersPath = getWorkspacePath('/members');
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
    <SidebarProvider className="h-full min-h-0">
      <Sidebar collapsible="none" className="border-r border-sidebar-border">
        <SidebarHeader>
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentWorkspace={workspace}
            onNavigate={navigate}
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="pt-2">
              <SidebarMenu>
                {appPages.map((page) => (
                  <SidebarMenuItem key={page.href}>
                    <SidebarMenuButton
                      isActive={
                        page.match ? page.match(location.pathname) : location.pathname === page.href
                      }
                      tooltip={page.label}
                      onClick={() => {
                        void navigate({ to: page.href });
                      }}
                    >
                      <page.icon className="size-4" />
                      <span>{page.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter>
          <UserActionsMenu
            currentWorkspace={workspace}
            onNavigate={navigate}
            onSignOut={() => {
              signOut();
            }}
          />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-14 items-center justify-end border-b px-4" />

        <div className="min-h-0 flex-1 overflow-hidden">
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
        </div>
      </SidebarInset>
    </SidebarProvider>
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
