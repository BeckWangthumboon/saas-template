import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConvexMutation } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ErrorCode } from '../../../shared/errors';
import type { Member, Role } from './types';
import { formatName } from './utils';

interface MemberRoleChangeDialogProps {
  workspaceId: Id<'workspaces'>;
  member: Member | null;
  callerRole: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: Id<'users'>;
}

export function MemberRoleChangeDialog({
  workspaceId,
  member,
  callerRole,
  open,
  onOpenChange,
  currentUserId,
}: MemberRoleChangeDialogProps) {
  const [lastOwnerError, setLastOwnerError] = useState(false);
  const { mutate: updateRole, state: updateRoleState } = useConvexMutation(
    api.workspace.updateMemberRole,
  );

  const isUpdatingRole = updateRoleState.status === 'loading';

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) setLastOwnerError(false);
  };

  const handleRoleChange = async (newRole: Role) => {
    if (!member) return;

    const result = await updateRole({
      workspaceId,
      userId: member._id,
      role: newRole,
    });

    if (result.isOk()) {
      toast.success('Role updated', {
        description: `${formatName(member.firstName, member.lastName) || member.email} is now a ${newRole}.`,
      });
      handleOpenChange(false);
    } else {
      if (result.error.code === ErrorCode.WORKSPACE_LAST_OWNER) {
        setLastOwnerError(true);
      } else {
        toast.error('Failed to update role', { description: result.error.message });
      }
    }
  };

  const getAvailableRoles = (memberToChange: Member): Role[] => {
    if (callerRole === 'owner') {
      return ['owner', 'admin', 'member'];
    }
    if (callerRole === 'admin') {
      if (memberToChange._id === currentUserId) {
        return ['admin', 'member']; // can demote self
      }
      return ['admin', 'member'];
    }
    return [];
  };

  const displayName = member ? formatName(member.firstName, member.lastName) || member.email : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Select a new role for <strong>{displayName}</strong>.
          </DialogDescription>
        </DialogHeader>
        {lastOwnerError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            You are the only owner of this workspace. You must transfer ownership to another member
            before changing your role.
          </div>
        )}
        <div className="flex flex-col gap-2">
          {member &&
            getAvailableRoles(member).map((role) => (
              <Button
                key={role}
                variant={role === member.role ? 'secondary' : 'outline'}
                className="justify-start capitalize"
                disabled={isUpdatingRole || role === member.role}
                onClick={() => handleRoleChange(role)}
              >
                {role}
                {role === member.role && (
                  <span className="text-muted-foreground ml-auto">(current)</span>
                )}
              </Button>
            ))}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isUpdatingRole} />}>
            Cancel
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
