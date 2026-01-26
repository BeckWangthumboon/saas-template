import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { Authenticated, Unauthenticated, useConvex } from 'convex/react';
import { useCallback, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { AppErrorBoundary } from '@/features/auth/AppErrorBoundary';
import { OnboardingDialog } from '@/features/onboarding/OnboardingDialog';
import { useConvexAction, useConvexMutation, useConvexQuery } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { AppErrorData } from '../../../shared/errors';

export const Route = createFileRoute('/_app')({
  component: AppLayout,
  errorComponent: AppErrorBoundary,
});

function AppLayout() {
  return (
    <>
      <Authenticated>
        <AuthenticatedLayout />
      </Authenticated>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
    </>
  );
}

function RedirectToSignIn() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: '/sign-in' });
  }, [navigate]);

  return null;
}

function AuthenticatedLayout() {
  const { signOut } = useAuth();
  const convex = useConvex();
  const { execute: ensureUser, state: ensureUserState } = useConvexAction(api.user.ensureUser);
  const { mutate: completeOnboarding } = useConvexMutation(api.user.completeOnboarding);

  const handleAuthFailure = useCallback(
    async (error: AppErrorData) => {
      console.error(`Auth failure [${error.code}]: ${error.message}`);
      try {
        await signOut({ navigate: false });
      } catch (signOutError) {
        console.error(signOutError);
      }
      convex.clearAuth();
      window.location.href = '/sign-in';
    },
    [convex, signOut],
  );

  useEffect(() => {
    void ensureUser().then((result) => {
      if (result.isErr()) {
        void handleAuthFailure(result.error);
      }
    });
  }, [ensureUser, handleAuthFailure]);

  const handleCompleteOnboarding = async () => {
    const result = await completeOnboarding({});
    if (result.isErr()) {
      console.error('Failed to complete onboarding:', result.error);
    }
  };

  if (ensureUserState.status !== 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

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

      <OnboardingDialogLoader onComplete={handleCompleteOnboarding} />
    </div>
  );
}

function OnboardingDialogLoader({ onComplete }: { onComplete: () => void }) {
  const { status: onboardingStatusState, data: onboardingStatus } = useConvexQuery(
    api.user.getOnboardingStatus,
  );
  const onboardingOpen = onboardingStatusState === 'success' && onboardingStatus === 'not_started';

  return (
    <OnboardingDialog open={onboardingOpen} onOpenChange={onComplete} onComplete={onComplete} />
  );
}
