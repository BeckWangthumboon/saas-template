import type { Id } from '@saas/convex-api';
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { FilesIcon, LayoutDashboardIcon, SettingsIcon, UsersIcon } from 'lucide-react';

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
  isWorkspaceReady,
  UserActionsMenu,
  useWorkspace,
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
  const location = useLocation();
  const { workspaces, getWorkspacePath, workspace } = workspaceContext;

  const membersPath = getWorkspacePath('/members');
  const contactsPath = getWorkspacePath('/contacts');
  const filesPath = getWorkspacePath('/files');

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

  appPages.push({
    label: 'Members',
    href: membersPath,
    icon: UsersIcon,
  });

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
        <header className="flex h-14 items-center justify-end border-b px-4">
          <a
            href="https://github.com/BeckWangthumboon/saas-template"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub repository"
            className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-4 fill-current"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.1.82-.26.82-.58v-2.22c-3.34.73-4.04-1.6-4.04-1.6-.54-1.36-1.33-1.73-1.33-1.73-1.09-.74.08-.73.08-.73 1.2.08 1.83 1.23 1.83 1.23 1.08 1.83 2.82 1.3 3.5.99.11-.77.42-1.3.76-1.59-2.66-.3-5.47-1.32-5.47-5.9 0-1.3.47-2.37 1.24-3.2-.12-.31-.54-1.56.12-3.25 0 0 1-.32 3.3 1.22a11.52 11.52 0 0 1 6 0c2.3-1.54 3.3-1.22 3.3-1.22.66 1.69.24 2.94.12 3.25.77.83 1.24 1.9 1.24 3.2 0 4.59-2.81 5.6-5.49 5.9.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5Z" />
            </svg>
          </a>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-6">
              <Outlet />
            </div>
          </ScrollArea>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
