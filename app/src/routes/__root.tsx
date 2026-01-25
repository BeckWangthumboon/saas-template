import { createRootRoute, ErrorComponent, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { Toaster } from '@/components/ui/sonner';

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  );
}

function RootErrorBoundary({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <ErrorComponent error={error} />
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <span className="text-6xl font-bold text-foreground">404</span>
      <p>Page not found</p>
    </div>
  );
}
