import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { MailIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConvexMutation, useConvexQuery } from '@/hooks';
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

function NoWorkspacesView() {
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { mutate: createWorkspace, state } = useConvexMutation(api.workspace.createWorkspace);
  const isLoading = state.status === 'loading';

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) return;

    const result = await createWorkspace({ name: workspaceName.trim() });

    if (result.isOk()) {
      toast.success('Workspace created', {
        description: `"${workspaceName.trim()}" is ready to use.`,
      });
      setDialogOpen(false);
      setWorkspaceName('');
      void navigate({ to: `/workspaces/${result.value}` });
    } else {
      toast.error('Failed to create workspace', { description: result.error.message });
    }
  };

  return (
    <div className="p-6 flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
          <p className="text-muted-foreground mt-2">
            Get started by creating a workspace or joining an existing one.
          </p>
        </div>

        <div className="space-y-3">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Card className="cursor-pointer transition-colors hover:bg-muted/50">
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
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create workspace</DialogTitle>
                <DialogDescription>
                  Give your workspace a name. You can change this later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace name</Label>
                <Input
                  id="workspace-name"
                  placeholder="My Workspace"
                  value={workspaceName}
                  onChange={(e) => {
                    setWorkspaceName(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && workspaceName.trim()) {
                      void handleCreateWorkspace();
                    }
                  }}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={isLoading} />}>
                  Cancel
                </DialogClose>
                <Button
                  onClick={handleCreateWorkspace}
                  disabled={!workspaceName.trim() || isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
        </div>
      </div>
    </div>
  );
}
