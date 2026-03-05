import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

import { isUserReady, useUser } from '@/features/auth';
import {
  InviteMemberDialog,
  isWorkspaceEntitlementsReady,
  isWorkspaceReady,
  type Role,
  useWorkspace,
  useWorkspaceEntitlements,
  WorkspaceInvitesTable,
  WorkspaceMembersTable,
  WorkspacePageHeading,
} from '@/features/workspaces';
import { useConvexQuery } from '@/hooks';

export const Route = createFileRoute('/_app/w/$workspaceKey/members')({
  component: MembersPage,
});

function MembersPage() {
  const workspaceContext = useWorkspace();
  const userContext = useUser();
  const entitlementsContext = useWorkspaceEntitlements();

  if (
    !isWorkspaceReady(workspaceContext) ||
    !isUserReady(userContext) ||
    !isWorkspaceEntitlementsReady(entitlementsContext)
  ) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (entitlementsContext.isSoloWorkspace) {
    return <SoloMembersRedirect workspaceKey={workspaceContext.workspaceKey} />;
  }

  return (
    <MembersPageContent
      workspaceId={workspaceContext.workspaceId as Id<'workspaces'>}
      currentUserRole={workspaceContext.role}
      currentUserId={userContext.user._id}
    />
  );
}

function SoloMembersRedirect({ workspaceKey }: { workspaceKey: string }) {
  const navigate = Route.useNavigate();

  useEffect(() => {
    void navigate({
      to: '/w/$workspaceKey',
      params: { workspaceKey },
      replace: true,
    });
  }, [navigate, workspaceKey]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">Redirecting...</p>
    </div>
  );
}

function MembersPageContent({
  workspaceId,
  currentUserRole,
  currentUserId,
}: {
  workspaceId: Id<'workspaces'>;
  currentUserRole: Role;
  currentUserId: Id<'users'>;
}) {
  const { data: members } = useConvexQuery(api.workspaces.members.getWorkspaceMembers, {
    workspaceId,
  });
  const isMembersLoading = members === undefined;

  const isAdminOrOwner = currentUserRole === 'owner' || currentUserRole === 'admin';

  return (
    <div className="max-w-4xl space-y-10">
      <WorkspacePageHeading
        title="Members"
        description="Manage workspace members and their permissions."
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Current Members</h2>
          {isAdminOrOwner && (
            <InviteMemberDialog workspaceId={workspaceId} callerRole={currentUserRole} />
          )}
        </div>

        <WorkspaceMembersTable
          members={members ?? []}
          isLoading={isMembersLoading}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          workspaceId={workspaceId}
        />
      </section>

      {isAdminOrOwner && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Pending Invitations</h2>
          <WorkspaceInvitesTable />
        </section>
      )}
    </div>
  );
}
