import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppErrorBoundary, UserProvider } from '@/features/auth';

export const Route = createFileRoute('/_invite')({
  component: InviteLayout,
  errorComponent: AppErrorBoundary,
});

function InviteLayout() {
  return (
    <UserProvider>
      <Outlet />
    </UserProvider>
  );
}
