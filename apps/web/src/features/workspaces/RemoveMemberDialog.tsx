import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
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

import type { Member, Role } from './types';
import { formatName } from './utils';

interface RemoveMemberDialogProps {
  workspaceId: Id<'workspaces'>;
  callerRole: Role;
  currentUserId: Id<'users'>;
  member: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoveMemberDialog({
  workspaceId,
  callerRole,
  currentUserId,
  member,
  open,
  onOpenChange,
}: RemoveMemberDialogProps) {
  const { mutate: removeMember, state: removeState } = useConvexMutation(
    api.workspaces.members.removeMember,
  );

  const isRemoving = removeState.status === 'loading';

  const canManageMember = (memberToRemove: Member): boolean => {
    if (memberToRemove._id === currentUserId) return false;
    if (callerRole === 'owner') return true;
    if (callerRole === 'admin') return memberToRemove.role === 'member';
    return false;
  };

  const handleRemoveMember = async () => {
    if (!member) return;
    if (!canManageMember(member)) return;

    const result = await removeMember({
      workspaceId,
      userId: member._id,
    });

    if (result.isOk()) {
      toast.success('Member removed', {
        description: `${formatName(member.firstName, member.lastName) || member.email} has been removed from the workspace.`,
      });
      onOpenChange(false);
    } else {
      toast.error('Failed to remove member', { description: result.error.message });
    }
  };

  const displayName = member ? formatName(member.firstName, member.lastName) || member.email : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove member?</DialogTitle>
          <DialogDescription>
            This will remove <strong>{displayName}</strong> from the workspace. They will lose
            access to all workspace data and can only rejoin if invited again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isRemoving} />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={handleRemoveMember} disabled={isRemoving}>
            {isRemoving ? 'Removing...' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
