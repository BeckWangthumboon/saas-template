import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { Authenticated, Unauthenticated, useConvex } from 'convex/react';
import { FileTextIcon, LayoutDashboardIcon, SettingsIcon } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { OnboardingDialog } from '@/features/onboarding/onboarding-dialog';
import { useConvexAction, useConvexMutation, useConvexQuery } from '@/hooks';
import { cn } from '@/lib/utils';

import { api } from '../../../convex/_generated/api';
import type { AppErrorData } from '../../../shared/errors';

export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

const appPages = [
  { label: 'Overview', href: '/', icon: LayoutDashboardIcon },
  { label: 'Form', href: '/form', icon: FileTextIcon },
  { label: 'Settings', href: '/settings', icon: SettingsIcon },
] as const;

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: typeof LayoutDashboardIcon;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}

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
  const location = useLocation();
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
    <div className="min-h-screen flex flex-col">
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

      {/* Sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-56 border-r bg-muted/40 p-3 shrink-0">
          <nav className="flex flex-col gap-1">
            {appPages.map((page) => (
              <NavItem
                key={page.href}
                href={page.href}
                icon={page.icon}
                label={page.label}
                isActive={location.pathname === page.href}
              />
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

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
