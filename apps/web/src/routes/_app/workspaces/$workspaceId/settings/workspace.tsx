import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import { ErrorCode } from '@saas/shared/errors';
import { useForm } from '@tanstack/react-form';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { isWorkspaceReady, useWorkspace } from '@/features/workspaces';
import { useConvexMutation } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/settings/workspace')({
  component: WorkspaceSettingsPage,
});

function WorkspaceSettingsPage() {
  const workspaceContext = useWorkspace();
  const navigate = useNavigate();

  const { mutate: updateWorkspaceName, state: updateState } = useConvexMutation(
    api.workspaces.index.updateWorkspaceName,
  );
  const { mutate: leaveWorkspace, state: leaveState } = useConvexMutation(
    api.workspaces.index.leaveWorkspace,
  );
  const { mutate: deleteWorkspace, state: deleteState } = useConvexMutation(
    api.workspaces.index.deleteWorkspace,
  );
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lastOwnerError, setLastOwnerError] = useState(false);
  const isReady = isWorkspaceReady(workspaceContext);
  const workspace = isReady ? workspaceContext.workspace : null;
  const workspaceId = isReady ? workspaceContext.workspaceId : null;
  const billingPath = isReady ? workspaceContext.getWorkspacePath('/settings/billing') : null;
  const role = workspace?.role ?? null;
  const workspaces = workspaceContext.workspaces;
  const isOwner = role === 'owner';
  const isUpdating = updateState.status === 'loading';
  const isLeaving = leaveState.status === 'loading';
  const isDeleting = deleteState.status === 'loading';
  const canEdit = role === 'owner' || role === 'admin';

  const form = useForm({
    defaultValues: {
      name: workspace?.name ?? '',
    },
    onSubmit: async ({ value }) => {
      if (!workspaceId) return;
      if (!canEdit) {
        toast.error('Insufficient permissions', {
          description: 'Only owners and admins can update the workspace name.',
        });
        return;
      }

      const nextWorkspaceName = value.name.trim();
      if (nextWorkspaceName === workspace?.name) {
        return;
      }

      const result = await updateWorkspaceName({
        workspaceId: workspaceId as Id<'workspaces'>,
        name: nextWorkspaceName,
      });

      if (result.isOk()) {
        toast.success('Workspace updated', {
          description: 'Workspace name has been updated successfully.',
        });
      } else {
        toast.error('Failed to update workspace', {
          description: result.error.message,
        });
      }
    },
  });

  const workspaceName = workspace?.name ?? '';

  useEffect(() => {
    if (!workspaceName) return;
    form.reset({ name: workspaceName });
  }, [form, workspaceName]);

  const handleLeaveWorkspace = async () => {
    if (!workspaceId || !workspace) return;
    const result = await leaveWorkspace({ workspaceId: workspaceId as Id<'workspaces'> });

    if (result.isErr()) {
      if (result.error.code === ErrorCode.WORKSPACE_LAST_OWNER) {
        setLastOwnerError(true);
        return;
      }
      toast.error('Failed to leave workspace', { description: result.error.message });
      return;
    }

    setLeaveDialogOpen(false);
    toast.success('Left workspace', {
      description: `You have left ${workspace.name}.`,
    });

    const nextWorkspace = workspaces.find((item) => item.id !== workspaceId);
    defaultWorkspaceStorage.set(nextWorkspace?.id ?? null);

    if (nextWorkspace) {
      void navigate({ to: `/workspaces/${nextWorkspace.id}` });
    } else {
      void navigate({ to: '/' });
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!workspaceId || !workspace) return;
    if (!isOwner) return;
    const result = await deleteWorkspace({ workspaceId: workspaceId as Id<'workspaces'> });

    if (result.isErr()) {
      if (result.error.code === ErrorCode.BILLING_WORKSPACE_DELETE_BLOCKED) {
        setDeleteDialogOpen(false);
        toast.error('Cancel billing before deleting', {
          description:
            'This workspace is still billable. Cancel in Billing, then retry once status is canceled.',
        });

        if (billingPath) {
          void navigate({ to: billingPath });
        }
        return;
      }

      toast.error('Failed to delete workspace', { description: result.error.message });
      return;
    }

    setDeleteDialogOpen(false);
    toast.success('Workspace deleted', {
      description: `${workspace.name} has been permanently deleted.`,
    });

    const nextWorkspace = workspaces.find((item) => item.id !== workspaceId);
    defaultWorkspaceStorage.set(nextWorkspace?.id ?? null);

    if (nextWorkspace) {
      void navigate({ to: `/workspaces/${nextWorkspace.id}` });
    } else {
      void navigate({ to: '/' });
    }
  };

  if (!workspaceId || !workspace) {
    if (workspaceContext.status === 'empty') {
      return <p className="text-muted-foreground">Workspace not found.</p>;
    }

    return <p className="text-muted-foreground">Loading workspace...</p>;
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Workspace</h1>
        <p className="text-muted-foreground text-sm">Manage workspace details and access.</p>
      </div>

      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Workspace Profile</h2>
          <Badge variant="secondary" className="capitalize">
            {workspace.role}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">Update your workspace name and details.</p>

        <form
          id="workspace-settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) => {
                  const trimmed = value.trim();
                  if (!trimmed) return 'Workspace name is required';
                  if (trimmed.length < 2) return 'Workspace name must be at least 2 characters';
                  if (trimmed.length > 50) return 'Workspace name must be at most 50 characters';
                  return undefined;
                },
              }}
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Workspace Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      aria-invalid={isInvalid}
                      placeholder="My Workspace"
                      autoComplete="off"
                      disabled={!canEdit || isUpdating}
                    />
                    <FieldDescription>
                      Only owners and admins can change the workspace name.
                    </FieldDescription>
                    {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                  </Field>
                );
              }}
            />

            <div className="pt-2">
              <Button
                type="submit"
                form="workspace-settings-form"
                disabled={
                  !form.state.canSubmit || form.state.isSubmitting || isUpdating || !canEdit
                }
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </section>

      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-destructive">Danger Zone</h1>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Leave Workspace</p>
            <p className="text-muted-foreground text-sm">
              You will lose access to this workspace unless invited again.
            </p>
          </div>
          <Dialog
            open={leaveDialogOpen}
            onOpenChange={(open) => {
              setLeaveDialogOpen(open);
              if (!open) setLastOwnerError(false);
            }}
          >
            <DialogTrigger render={<Button variant="destructive" />}>Leave</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Leave workspace?</DialogTitle>
                <DialogDescription>
                  This action will remove your access to the workspace and its data. You can only
                  rejoin if an owner or admin invites you again.
                </DialogDescription>
              </DialogHeader>
              {lastOwnerError && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                  You are the only owner of this workspace. You must either transfer ownership to
                  another member or delete the workspace.
                </div>
              )}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={isLeaving} />}>
                  Cancel
                </DialogClose>
                <Button variant="destructive" onClick={handleLeaveWorkspace} disabled={isLeaving}>
                  {isLeaving ? 'Leaving...' : 'Leave Workspace'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isOwner && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Workspace</p>
              <p className="text-muted-foreground text-sm">
                This will permanently delete the workspace and all its data. This action cannot be
                undone.
              </p>
            </div>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger render={<Button variant="destructive" />}>Delete</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete workspace?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete <strong>{workspace.name}</strong> and all its data,
                    including members, invites, and all associated resources. This action cannot be
                    undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" disabled={isDeleting} />}>
                    Cancel
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteWorkspace}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Workspace'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </section>
    </div>
  );
}
