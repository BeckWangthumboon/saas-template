import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import { ErrorCode, parseAppError } from '@saas/shared/errors';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvex } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/features/workspaces';
import { useConvexMutation, useConvexQuery } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';

export const Route = createFileRoute('/_invite/invite/$token')({
  component: InvitePage,
  errorComponent: InviteErrorBoundary,
});

function showAcceptInviteErrorToast(errorCode: string) {
  if (errorCode === ErrorCode.INVITE_ACCEPT_RATE_LIMITED) {
    toast.error('Too many join attempts', {
      description: 'Please wait a moment before trying to accept this invite again.',
    });
    return;
  }

  if (errorCode === ErrorCode.BILLING_PLAN_REQUIRED) {
    toast.error('Upgrade required', {
      description: 'This workspace is on a plan that does not allow adding members right now.',
    });
    return;
  }

  if (errorCode === ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED) {
    toast.error('Workspace limit reached', {
      description: 'This workspace has reached its current member limit. Ask an admin to upgrade.',
    });
    return;
  }

  if (errorCode === ErrorCode.BILLING_WORKSPACE_LOCKED) {
    toast.error('Workspace locked', {
      description:
        'This workspace is temporarily restricted due to a billing issue. Ask an admin to resolve billing.',
    });
    return;
  }

  if (errorCode === ErrorCode.INVITE_EXPIRED) {
    toast.error('Invite expired', {
      description: 'This invite has expired. Ask an admin to send a new link.',
    });
    return;
  }

  if (errorCode === ErrorCode.INVITE_ALREADY_REVOKED) {
    toast.error('Invite revoked', {
      description: 'This invite was revoked. Ask an admin to send a new link.',
    });
    return;
  }

  if (errorCode === ErrorCode.INVITE_NOT_FOUND) {
    toast.error('Invite not found', {
      description: 'This invite link is invalid. Ask an admin to send a new one.',
    });
    return;
  }

  toast.error('Failed to accept invite', {
    description: 'Something went wrong while accepting this invite.',
  });
}

interface InviteDetailsSnapshot {
  workspaceName: string;
  role: 'admin' | 'member';
  inviterName: string | null;
  inviterEmail: string;
  expiresAt: number;
}

function InvitePage() {
  const navigate = useNavigate();
  const { token } = Route.useParams();
  const [inviteSnapshot, setInviteSnapshot] = useState<InviteDetailsSnapshot | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<Id<'teamMemberRequests'> | null>(null);
  const inviteQuery = useConvexQuery(
    api.workspaces.invites.getInviteForAcceptance,
    pendingRequestId === null ? { token } : 'skip',
  );
  const handledFailedRequestIdRef = useRef<Id<'teamMemberRequests'> | null>(null);
  const { mutate: acceptInvite, state: acceptState } = useConvexMutation(
    api.workspaces.invites.acceptInvite,
  );
  const acceptInviteRequest = useConvexQuery(
    api.workspaces.invites.getAcceptInviteRequest,
    pendingRequestId ? { requestId: pendingRequestId } : 'skip',
  );
  const isProcessingAcceptRequest =
    pendingRequestId !== null &&
    (acceptInviteRequest.status === 'loading' ||
      (acceptInviteRequest.status === 'success' && acceptInviteRequest.data.status === 'pending'));
  const isAccepting = acceptState.status === 'loading' || isProcessingAcceptRequest;
  const inviteDetails = inviteQuery.status === 'success' ? inviteQuery.data : inviteSnapshot;
  const inviteRole = inviteDetails?.role;

  useEffect(() => {
    if (pendingRequestId === null || acceptInviteRequest.status !== 'success') {
      return;
    }

    if (acceptInviteRequest.data.status === 'completed') {
      defaultWorkspaceStorage.set(acceptInviteRequest.data.workspaceKey);
      toast.success('Invite accepted', {
        description: `You joined ${acceptInviteRequest.data.workspaceName} as a ${inviteRole}.`,
      });
      void navigate({
        to: '/w/$workspaceKey',
        params: { workspaceKey: acceptInviteRequest.data.workspaceKey },
      });
      return;
    }

    if (
      acceptInviteRequest.data.status === 'failed' &&
      handledFailedRequestIdRef.current !== pendingRequestId
    ) {
      showAcceptInviteErrorToast(acceptInviteRequest.data.errorCode);
      handledFailedRequestIdRef.current = pendingRequestId;
    }
  }, [acceptInviteRequest, inviteRole, navigate, pendingRequestId]);

  const handleAcceptInvite = async () => {
    if (inviteQuery.status !== 'success') {
      return;
    }

    const result = await acceptInvite({ token });

    if (result.isOk()) {
      if (result.value.status === 'completed') {
        defaultWorkspaceStorage.set(result.value.workspaceKey);
        toast.success('Invite accepted', {
          description: `You joined ${result.value.workspaceName} as a ${inviteRole}.`,
        });
        void navigate({
          to: '/w/$workspaceKey',
          params: { workspaceKey: result.value.workspaceKey },
        });
        return;
      }

      handledFailedRequestIdRef.current = null;
      setInviteSnapshot(inviteQuery.data);
      setPendingRequestId(result.value.requestId);
    } else {
      if (result.error.code === ErrorCode.INVITE_ACCEPT_RATE_LIMITED) {
        toast.error('Too many join attempts', {
          description: 'Please wait a moment before trying to accept this invite again.',
        });
      } else {
        toast.error('Failed to accept invite', {
          description: result.error.message,
        });
      }
    }
  };

  if (!inviteDetails) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground">Loading invite...</p>
      </main>
    );
  }

  const inviterLabel = inviteDetails.inviterName ?? inviteDetails.inviterEmail;
  const inviterEmail = inviteDetails.inviterEmail;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Join workspace</CardTitle>
          <CardDescription>
            {inviterLabel} has invited you to join <strong>{inviteDetails.workspaceName}</strong> as
            a {inviteDetails.role}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 rounded-md border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Workspace</p>
                <p className="font-medium">{inviteDetails.workspaceName}</p>
              </div>
              <Badge
                variant={inviteDetails.role === 'admin' ? 'secondary' : 'outline'}
                className="capitalize"
              >
                {inviteDetails.role}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Invited by</p>
              <p className="font-medium">{inviterLabel}</p>
              {inviterEmail && <p className="text-muted-foreground text-xs">{inviterEmail}</p>}
            </div>
            <p className="text-muted-foreground text-sm">
              Expires {formatDate(inviteDetails.expiresAt)}
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
    workspaceKey?: string;
    hasNewerInvite?: boolean;
  } | null;

  let title = 'Invite unavailable';
  let description = 'This invite link is no longer valid.';
  let showSignOut = false;
  let workspaceKey: string | null = null;

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
        workspaceKey = context?.workspaceKey ?? null;
        break;
      case ErrorCode.INVITE_EMAIL_MISMATCH:
        title = 'Wrong account';
        description = `This invite was sent to ${
          context?.inviteEmail ?? 'a different email'
        }. You are signed in as ${context?.userEmail ?? 'another account'}.`;
        showSignOut = true;
        break;
      case ErrorCode.BILLING_PLAN_REQUIRED:
        title = 'Invite unavailable';
        description = 'This workspace is on a plan that does not allow adding members right now.';
        break;
      case ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED:
        title = 'Workspace limit reached';
        description =
          'This workspace has reached its current member or invite limit. Ask an admin to upgrade.';
        break;
      case ErrorCode.BILLING_WORKSPACE_LOCKED:
        title = 'Workspace locked';
        description =
          'This workspace is temporarily restricted due to a billing issue. Ask an admin to resolve billing.';
        break;
      case ErrorCode.INVITE_ACCEPT_RATE_LIMITED:
        title = 'Too many attempts';
        description = 'Please wait a moment before trying to accept this invite again.';
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
          {workspaceKey && (
            <Link
              className={buttonVariants({ variant: 'default' })}
              to="/w/$workspaceKey"
              params={{ workspaceKey }}
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
