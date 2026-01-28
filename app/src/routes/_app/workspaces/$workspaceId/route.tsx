import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { LayoutDashboardIcon, SettingsIcon, UsersIcon } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  isWorkspaceReady,
  useWorkspace,
  WorkspaceProvider,
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
  const location = useLocation();
  const navigate = useNavigate();
  if (!isWorkspaceReady(workspaceContext)) {
    const message =
      workspaceContext.status === 'empty' ? 'No workspaces found.' : 'Loading workspace...';
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{message}</p>
      </div>
    );
  }

  const { workspaces, getWorkspacePath, workspace } = workspaceContext;

  const appPages: AppPage[] = [
    {
      label: 'Overview',
      href: getWorkspacePath(),
      icon: LayoutDashboardIcon,
    },
    { label: 'Members', href: getWorkspacePath('/members'), icon: UsersIcon },
    {
      label: 'Settings',
      href: getWorkspacePath('/settings/workspace'),
      icon: SettingsIcon,
      match: (path: string) => path.startsWith(getWorkspacePath('/settings')),
    },
  ];

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
            <Outlet />
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
