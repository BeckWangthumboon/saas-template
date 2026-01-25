import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { FileTextIcon, LayoutDashboardIcon, SettingsIcon } from 'lucide-react';
import { useEffect } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useConvexQuery } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';
import { cn } from '@/lib/utils';

import { api } from '../../../../../convex/_generated/api';

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
  const location = useLocation();
  const navigate = useNavigate();
  const { status, data } = useConvexQuery(api.workspace.getUserWorkspaces);
  const workspaces = data ?? [];
  const workspace = workspaces.find((item) => item.id === workspaceId);

  const appPages = [
    {
      label: 'Overview',
      href: `/worksaces/${workspaceId}`,
      icon: LayoutDashboardIcon,
    },
    { label: 'Form', href: `/workspaces/${workspaceId}/form`, icon: FileTextIcon },
    {
      label: 'Settings',
      href: `/workspaces/${workspaceId}/settings`,
      icon: SettingsIcon,
    },
  ];

  useEffect(() => {
    if (status !== 'success') return;
    if (!workspace) {
      void navigate({ to: '/' });
      return;
    }
    defaultWorkspaceStorage.set(workspaceId);
  }, [navigate, status, workspace, workspaceId]);

  if (status !== 'success') {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  if (!workspace) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
      <aside className="sticky top-0 h-full w-56 shrink-0 border-r bg-muted/40 p-3">
        <nav className="flex flex-col gap-1">
          {appPages.map((page) => (
            <NavItem
              key={page.href}
              href={page.href}
              icon={page.icon}
              label={page.label}
              isActive={location.pathname === page.href}
            />
          ))}
        </nav>
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
