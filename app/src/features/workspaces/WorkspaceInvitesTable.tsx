import { useState } from 'react';
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
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useConvexMutation, useConvexQuery } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { Invite } from './types';
import { formatDate, formatName } from './utils';

interface WorkspaceInvitesTableProps {
  workspaceId: Id<'workspaces'>;
}

export function WorkspaceInvitesTable({ workspaceId }: WorkspaceInvitesTableProps) {
  const { data: invites } = useConvexQuery(api.invite.getWorkspaceInvites, { workspaceId });

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [inviteToRevoke, setInviteToRevoke] = useState<Invite | null>(null);

  const { mutate: revokeInvite, state: revokeState } = useConvexMutation(api.invite.revokeInvite);
  const isRevoking = revokeState.status === 'loading';

  const handleRevokeInvite = async () => {
    if (!inviteToRevoke) return;

    const result = await revokeInvite({ inviteId: inviteToRevoke._id });

    if (result.isOk()) {
      toast.success('Invitation revoked', {
        description: `The invitation to ${inviteToRevoke.email} has been revoked.`,
      });
      setRevokeDialogOpen(false);
      setInviteToRevoke(null);
    } else {
      toast.error('Failed to revoke invitation', { description: result.error.message });
    }
  };

  if (!invites) {
    return <p className="text-muted-foreground text-sm">Loading invitations...</p>;
  }

  if (invites.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending invitations.</p>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Invited by</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((invite) => (
            <TableRow key={invite._id}>
              <TableCell className="font-medium">{invite.email}</TableCell>
              <TableCell>
                <Badge
                  variant={invite.role === 'admin' ? 'secondary' : 'outline'}
                  className="capitalize"
                >
                  {invite.role}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatName(invite.inviter.firstName, invite.inviter.lastName) ||
                  invite.inviter.email}
              </TableCell>
              <TableCell>
                {invite.isExpired ? (
                  <Badge variant="destructive">Expired</Badge>
                ) : (
                  <span className="text-muted-foreground">{formatDate(invite.expiresAt)}</span>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setInviteToRevoke(invite);
                    setRevokeDialogOpen(true);
                  }}
                >
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke invitation?</DialogTitle>
            <DialogDescription>
              This will cancel the invitation to <strong>{inviteToRevoke?.email}</strong>. They will
              not be able to join the workspace using this invite link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isRevoking} />}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={handleRevokeInvite} disabled={isRevoking}>
              {isRevoking ? 'Revoking...' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
