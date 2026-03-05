import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';

import { Button } from '@/components/ui/button';
import { AppErrorBoundary, UserProvider } from '@/features/auth';

export const Route = createFileRoute('/_app')({
  component: AppLayout,
  errorComponent: AppErrorBoundary,
});

function AppLayout() {
  return (
    <UserProvider>
      <AuthenticatedLayout />
    </UserProvider>
  );
}

function AuthenticatedLayout() {
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const isWorkspaceRoute = pathname.startsWith('/workspaces/');

  if (isWorkspaceRoute) {
    return (
      <div className="flex h-dvh flex-col">
        <main className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="h-14 border-b px-4 flex items-center justify-end shrink-0">
        <nav className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              signOut();
            }}
          >
            Sign out
          </Button>
        </nav>
      </header>

      {/* Content */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
