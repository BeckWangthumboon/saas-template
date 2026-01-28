import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { MailIcon, PlusIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/features/auth';
import { WorkspaceCreator } from '@/features/workspaces';
import { useConvexQuery } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/_app/')({
  component: OverviewPage,
});

function OverviewPage() {
  const navigate = useNavigate();
  const { status, data } = useConvexQuery(api.workspace.getUserWorkspaces);
  const workspaces = useMemo(() => data ?? [], [data]);
  const defaultWorkspaceId = useMemo(() => defaultWorkspaceStorage.get(), []);

  useEffect(() => {
    if (status !== 'success') return;
    if (workspaces.length === 0) return;

    const matched = workspaces.find((workspace) => workspace.id === defaultWorkspaceId);
    const target = matched ?? workspaces[0];
    void navigate({ to: `/workspaces/${target.id}` });
  }, [defaultWorkspaceId, navigate, status, workspaces]);

  if (status !== 'success') {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (workspaces.length > 0) {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Redirecting to workspace...</p>
      </div>
    );
  }

  return <NoWorkspacesView />;
}

function CreateWorkspaceCard({ onClick }: { onClick: () => void }) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={onClick}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
            <PlusIcon className="text-primary h-5 w-5" />
          </div>
          <div>
            <CardTitle>Create a workspace</CardTitle>
            <CardDescription>Start fresh with a new workspace</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

function NoWorkspacesView() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const userContext = useUser();
  const user = userContext.status === 'ready' ? userContext.user : undefined;

  const defaultWorkspaceName = user?.firstName ? `${user.firstName}'s workspace` : '';

  if (userContext.status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p className="text-muted-foreground mt-2">
            Get started by creating a workspace or joining an existing one.
          </p>
        </div>

        <div className="space-y-3">
          <WorkspaceCreator
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            defaultName={defaultWorkspaceName}
            onSuccess={(workspaceId) => {
              void navigate({ to: `/workspaces/${workspaceId}` });
            }}
            trigger={
              <CreateWorkspaceCard
                onClick={() => {
                  setDialogOpen(true);
                }}
              />
            }
          />

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                  <MailIcon className="text-muted-foreground h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Join via invite</CardTitle>
                  <CardDescription>
                    Ask a workspace admin to send you an invite link
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="-mt-2">
              <p className="text-muted-foreground text-sm">
                Once you receive an invite, click the link to join the workspace.
              </p>
            </CardContent>
          </Card>

          <Link to="/settings" className="block">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                    <SettingsIcon className="text-muted-foreground h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>Account Settings</CardTitle>
                    <CardDescription>Manage your profile and account</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
