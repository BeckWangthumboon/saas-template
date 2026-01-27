import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { Authenticated, Unauthenticated, useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { createContext, type ReactNode, useCallback, useContext, useEffect } from 'react';

import { OnboardingDialog } from '@/features/onboarding/OnboardingDialog';
import { useConvexAction, useConvexMutation, useConvexQuery } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { AppErrorData } from '../../../shared/errors';

export type User = NonNullable<FunctionReturnType<typeof api.user.getUserOrNull>>;

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
  const { execute: ensureUser, state: ensureUserState } = useConvexAction(api.user.ensureUser);
  const { data: userData } = useConvexQuery(api.user.getUserOrNull);

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

  if (ensureUserState.status !== 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const resolvedUser = userData ?? ensureUserState.data;
  const value: UserContextValue = { status: 'ready', user: resolvedUser };

  return (
    <UserContext.Provider value={value}>
      {children}
      <OnboardingDialogLoader />
    </UserContext.Provider>
  );
}

function OnboardingDialogLoader() {
  const { status: onboardingStatusState, data: onboardingStatus } = useConvexQuery(
    api.user.getOnboardingStatus,
  );
  const { mutate: completeOnboarding } = useConvexMutation(api.user.completeOnboarding);

  const handleCompleteOnboarding = async () => {
    const result = await completeOnboarding({});
    if (result.isErr()) {
      console.error('Failed to complete onboarding:', result.error);
    }
  };

  const onboardingOpen = onboardingStatusState === 'success' && onboardingStatus === 'not_started';

  return (
    <OnboardingDialog
      open={onboardingOpen}
      onOpenChange={handleCompleteOnboarding}
      onComplete={handleCompleteOnboarding}
    />
  );
}
