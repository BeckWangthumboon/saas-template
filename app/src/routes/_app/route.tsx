import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_app')({
  component: AppLayout,
  // TODO: Add WorkOS auth guard via beforeLoad
  // beforeLoad: async ({ context }) => {
  //   if (!context.auth.isAuthenticated) {
  //     throw redirect({ to: '/sign-in' });
  //   }
  // },
});

function AppLayout() {
  return <Outlet />;
}
