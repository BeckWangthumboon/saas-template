import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvex } from 'convex/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/features/workspaces';
import { useConvexMutation, useConvexQuery } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';

import { api } from '../../../../convex/_generated/api';
import { ErrorCode, parseAppError } from '../../../../shared/errors';

export const Route = createFileRoute('/_invite/invite/$token')({
  component: InvitePage,
  errorComponent: InviteErrorBoundary,
});

function InvitePage() {
  const navigate = useNavigate();
  const { token } = Route.useParams();
  const inviteQuery = useConvexQuery(api.invite.getInviteForAcceptance, { token });
  const { mutate: acceptInvite, state: acceptState } = useConvexMutation(api.invite.acceptInvite);
  const isAccepting = acceptState.status === 'loading';

  const handleAcceptInvite = async () => {
    const result = await acceptInvite({ token });

    if (result.isOk()) {
      defaultWorkspaceStorage.set(result.value.workspaceId);
      toast.success('Invite accepted', {
        description: `You joined ${result.value.workspaceName} as a ${result.value.role}.`,
      });
      void navigate({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: result.value.workspaceId },
      });
    } else {
      toast.error('Failed to accept invite', {
        description: result.error.message,
      });
    }
  };

  if (inviteQuery.status !== 'success') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground">Loading invite...</p>
      </main>
    );
  }

  const inviterLabel = inviteQuery.data.inviterName ?? inviteQuery.data.inviterEmail;
  const inviterEmail = inviteQuery.data.inviterEmail;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Join workspace</CardTitle>
          <CardDescription>
            {inviterLabel} has invited you to join <strong>{inviteQuery.data.workspaceName}</strong>{' '}
            as a {inviteQuery.data.role}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 rounded-md border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Workspace</p>
                <p className="font-medium">{inviteQuery.data.workspaceName}</p>
              </div>
              <Badge
                variant={inviteQuery.data.role === 'admin' ? 'secondary' : 'outline'}
                className="capitalize"
              >
                {inviteQuery.data.role}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Invited by</p>
              <p className="font-medium">{inviterLabel}</p>
              {inviterEmail && <p className="text-muted-foreground text-xs">{inviterEmail}</p>}
            </div>
            <p className="text-muted-foreground text-sm">
              Expires {formatDate(inviteQuery.data.expiresAt)}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={handleAcceptInvite} disabled={isAccepting}>
              {isAccepting ? 'Joining...' : 'Accept invite'}
            </Button>
            <Link className={buttonVariants({ variant: 'outline' })} to="/">
              Not now
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function InviteErrorBoundary({ error }: { error: Error }) {
  const appError = parseAppError(error);
  const { signOut } = useAuth();
  const convex = useConvex();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const context = appError?.context as {
    inviteEmail?: string;
    userEmail?: string;
    workspaceId?: string;
    hasNewerInvite?: boolean;
  } | null;

  let title = 'Invite unavailable';
  let description = 'This invite link is no longer valid.';
  let showSignOut = false;
  let workspaceId: string | null = null;

  if (appError) {
    switch (appError.code) {
      case ErrorCode.INVITE_NOT_FOUND:
        title = 'Invite not found';
        description = 'This invite link is invalid. Ask an admin to send a new one.';
        break;
      case ErrorCode.INVITE_EXPIRED:
        title = 'Invite expired';
        description = context?.hasNewerInvite
          ? 'This invite expired. A newer invite may have been sent.'
          : 'This invite has expired. Ask an admin to send a new link.';
        break;
      case ErrorCode.INVITE_ALREADY_REVOKED:
        title = 'Invite revoked';
        description = context?.hasNewerInvite
          ? 'This invite was revoked. A newer invite may have been sent.'
          : 'This invite was revoked. Ask an admin to send a new link.';
        break;
      case ErrorCode.INVITE_ALREADY_ACCEPTED:
        title = 'Invite already used';
        description = context?.hasNewerInvite
          ? 'This invite was already accepted. A newer invite may have been sent.'
          : 'This invite was already accepted.';
        break;
      case ErrorCode.INVITE_ALREADY_MEMBER:
        title = 'Already a member';
        description = 'You are already a member of this workspace.';
        workspaceId = context?.workspaceId ?? null;
        break;
      case ErrorCode.INVITE_EMAIL_MISMATCH:
        title = 'Wrong account';
        description = `This invite was sent to ${
          context?.inviteEmail ?? 'a different email'
        }. You are signed in as ${context?.userEmail ?? 'another account'}.`;
        showSignOut = true;
        break;
      default:
        break;
    }
  }

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ navigate: false });
    } catch (signOutError) {
      console.error(signOutError);
    }
    convex.clearAuth();
    window.location.href = '/sign-in';
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link className={buttonVariants({ variant: 'outline' })} to="/">
            Go home
          </Link>
          {workspaceId && (
            <Link
              className={buttonVariants({ variant: 'default' })}
              to="/workspaces/$workspaceId"
              params={{ workspaceId }}
            >
              Go to workspace
            </Link>
          )}
          {showSignOut && (
            <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
