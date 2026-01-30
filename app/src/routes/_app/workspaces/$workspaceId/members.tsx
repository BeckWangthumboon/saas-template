import { createFileRoute } from '@tanstack/react-router';

import { isUserReady, useUser } from '@/features/auth';
import {
  InviteMemberDialog,
  isWorkspaceReady,
  type Role,
  useWorkspace,
  WorkspaceInvitesTable,
  WorkspaceMembersTable,
} from '@/features/workspaces';
import { useConvexQuery } from '@/hooks';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/members')({
  component: MembersPage,
});

function MembersPage() {
  const workspaceContext = useWorkspace();
  const userContext = useUser();

  if (!isWorkspaceReady(workspaceContext) || !isUserReady(userContext)) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <MembersPageContent
      workspaceId={workspaceContext.workspaceId as Id<'workspaces'>}
      currentUserRole={workspaceContext.role}
      currentUserId={userContext.user._id}
    />
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
  const { data: members } = useConvexQuery(api.workspace.getWorkspaceMembers, { workspaceId });
  const isMembersLoading = members === undefined;

  const isAdminOrOwner = currentUserRole === 'owner' || currentUserRole === 'admin';

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Members</h1>
        <p className="text-muted-foreground text-sm">
          Manage workspace members and their permissions.
        </p>
      </div>

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
