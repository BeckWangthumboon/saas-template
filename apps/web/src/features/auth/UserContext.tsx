import { api } from '@saas/convex-api';
import type { AppErrorData } from '@saas/shared/errors';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { Authenticated, Unauthenticated, useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

import { OnboardingDialog } from '@/features/onboarding/OnboardingDialog';
import { useConvexAction, useConvexMutation, useConvexQuery } from '@/hooks';

export type User = NonNullable<FunctionReturnType<typeof api.users.index.getUserOrNull>>;

export type UserContextValue = { status: 'loading' } | { status: 'ready'; user: User };

export function isUserReady(context: UserContextValue) {
  return context.status === 'ready';
}

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Hook to access the current user context.
 * Must be used within a UserProvider.
 * @throws Error if used outside of UserProvider
 */
export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

function RedirectToSignIn() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: '/sign-in' });
  }, [navigate]);

  return null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <Authenticated>
        <UserProviderInternal>{children}</UserProviderInternal>
      </Authenticated>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
    </>
  );
}

function UserProviderInternal({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const convex = useConvex();
  const { execute: ensureUser, state: ensureUserState } = useConvexAction(
    api.users.index.ensureUser,
  );
  const attemptedEnsureUserRef = useRef(false);
  const { status: userStatus, data: userData } = useConvexQuery(api.users.index.getUserOrNull);

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
    if (userStatus !== 'success') {
      return;
    }
    if (userData !== null) {
      return;
    }
    if (attemptedEnsureUserRef.current) {
      return;
    }

    attemptedEnsureUserRef.current = true;

    void ensureUser().then((result) => {
      if (result.isErr()) {
        void handleAuthFailure(result.error);
      }
    });
  }, [ensureUser, handleAuthFailure, userData, userStatus]);

  if (userStatus !== 'success' || userData === null || ensureUserState.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          Setting up your account... This can take a few seconds.
        </p>
      </div>
    );
  }

  const value: UserContextValue = { status: 'ready', user: userData };

  return (
    <UserContext.Provider value={value}>
      {children}
      <OnboardingDialogLoader />
    </UserContext.Provider>
  );
}

function OnboardingDialogLoader() {
  const { status: onboardingStatusState, data: onboardingStatus } = useConvexQuery(
    api.users.index.getOnboardingStatus,
  );
  const { mutate: completeOnboarding } = useConvexMutation(api.users.index.completeOnboarding);

  const handleCompleteOnboarding = async () => {
    const result = await completeOnboarding({});
    if (result.isErr()) {
      console.error('Failed to complete onboarding:', result.error);
    }
  };

  const onboardingOpen = onboardingStatusState === 'success' && onboardingStatus === 'not_started';

  return <OnboardingDialog open={onboardingOpen} onComplete={handleCompleteOnboarding} />;
}
