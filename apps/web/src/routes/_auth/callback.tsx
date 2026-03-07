import { api } from '@saas/convex-api';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvex } from 'convex/react';
import { useEffect, useRef } from 'react';

import { useConvexAction } from '@/hooks';

export const Route = createFileRoute('/_auth/callback')({
  component: CallbackPage,
});

function CallbackPage() {
  const { isLoading, signOut, user } = useAuth();
  const convex = useConvex();
  const navigate = useNavigate();
  const { execute: ensureUser } = useConvexAction(api.users.index.ensureUser);
  const hasHandledCallbackRef = useRef(false);

  useEffect(() => {
    if (isLoading || hasHandledCallbackRef.current) {
      return;
    }

    hasHandledCallbackRef.current = true;

    if (!user) {
      void navigate({ to: '/sign-in' });
      return;
    }

    void ensureUser().then(async (result) => {
      if (result.isOk()) {
        await navigate({ to: '/' });
        return;
      }

      console.error(`Auth failure [${result.error.code}]: ${result.error.message}`);

      try {
        await signOut({ navigate: false });
      } catch (signOutError) {
        console.error(signOutError);
      }

      convex.clearAuth();
      window.location.href = '/sign-in';
    });
  }, [convex, ensureUser, isLoading, navigate, signOut, user]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </main>
  );
}
