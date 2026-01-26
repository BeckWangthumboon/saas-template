import { ErrorComponent } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvex } from 'convex/react';
import { useEffect, useMemo, useRef } from 'react';

import { ErrorCode, parseAppError } from '../../../shared/errors';

export function AppErrorBoundary({ error }: { error: Error }) {
  const { signOut } = useAuth();
  const convex = useConvex();
  const hasHandledAuthError = useRef(false);
  const appError = parseAppError(error);
  const isAuthError = useMemo(() => {
    if (appError) {
      return (
        appError.code === ErrorCode.AUTH_USER_NOT_FOUND ||
        appError.code === ErrorCode.AUTH_UNAUTHORIZED ||
        appError.code === ErrorCode.AUTH_WORKOS_USER_NOT_FOUND
      );
    }

    if (!(error instanceof Error)) {
      return false;
    }

    return (
      error.message.includes('AUTH_USER_NOT_FOUND') ||
      error.message.includes('AUTH_UNAUTHORIZED') ||
      error.message.includes('Authentication required') ||
      error.message.includes('User not found')
    );
  }, [appError, error]);

  useEffect(() => {
    if (!isAuthError || hasHandledAuthError.current) return;
    hasHandledAuthError.current = true;

    void signOut({ navigate: false }).catch((signOutError: unknown) => {
      console.error(signOutError);
    });
    convex.clearAuth();
    window.location.href = '/sign-in';
  }, [convex, isAuthError, signOut]);

  if (isAuthError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Signing out...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <ErrorComponent error={error} />
    </div>
  );
}
