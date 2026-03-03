import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
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

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="h-14 border-b px-4 flex items-center justify-between shrink-0">
        <Link to="/" className="font-semibold text-lg">
          SaaS Template
        </Link>
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
