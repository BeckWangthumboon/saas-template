import { SearchIcon } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useConvexMutation, useConvexQuery, useDebounce } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { Invite } from './types';
import { formatDate, formatName } from './utils';

interface WorkspaceInvitesTableProps {
  workspaceId: Id<'workspaces'>;
}

export function WorkspaceInvitesTable({ workspaceId }: WorkspaceInvitesTableProps) {
  const { data: invites } = useConvexQuery(api.invite.getWorkspaceInvites, { workspaceId });

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [inviteToRevoke, setInviteToRevoke] = useState<Invite | null>(null);
  const headerCellClassName = 'sticky top-0 z-10 bg-background';

  const filteredInvites = invites?.filter((invite) =>
    invite.email.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

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
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search invitations..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            className="pl-8"
          />
        </div>
        <ScrollArea className="h-[320px] max-h-[50vh] **:data-[slot=table-container]:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={headerCellClassName}>Email</TableHead>
                <TableHead className={headerCellClassName}>Role</TableHead>
                <TableHead className={headerCellClassName}>Invited by</TableHead>
                <TableHead className={headerCellClassName}>Expires</TableHead>
                <TableHead className={`${headerCellClassName} w-12`}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvites?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                    No invitations found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvites?.map((invite) => (
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
                        <span className="text-muted-foreground">
                          {formatDate(invite.expiresAt)}
                        </span>
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
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

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
