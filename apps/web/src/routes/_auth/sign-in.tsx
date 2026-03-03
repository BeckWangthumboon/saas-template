import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useEffect } from 'react';

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignInPage,
});

function SignInPage() {
  const { signIn, isLoading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (user) {
      void navigate({ to: '/' });
    } else {
      void signIn();
    }
  }, [isLoading, user, navigate, signIn]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </main>
  );
}
