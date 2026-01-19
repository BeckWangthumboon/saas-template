import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignInPage,
});

function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center text-3xl font-semibold text-foreground">
      Sign In
    </main>
  );
}
