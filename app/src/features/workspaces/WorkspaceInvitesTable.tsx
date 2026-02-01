import { MoreHorizontalIcon, SearchIcon } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { formatDate, formatInviteLink, formatName } from './utils';
import { isWorkspaceReady, useWorkspace } from './WorkspaceContext';

export function WorkspaceInvitesTable() {
  const workspaceContext = useWorkspace();
  const isReady = isWorkspaceReady(workspaceContext);
  const canQueryInvites = isReady && workspaceContext.role !== 'member';
  const { data: invites } = useConvexQuery(
    api.workspaces.invites.getWorkspaceInvites,
    canQueryInvites ? { workspaceId: workspaceContext.workspaceId as Id<'workspaces'> } : 'skip',
  );

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [inviteToRevoke, setInviteToRevoke] = useState<Invite | null>(null);
  const headerCellClassName = 'sticky top-0 z-10 bg-background';

  const filteredInvites = invites?.filter((invite) =>
    invite.email.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const { mutate: revokeInvite, state: revokeState } = useConvexMutation(
    api.workspaces.invites.revokeInvite,
  );
  const isRevoking = revokeState.status === 'loading';

  const handleCopyInviteLink = async (invite: Invite) => {
    const link = formatInviteLink(invite.token);

    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
    } catch {
      toast.error('Failed to copy invite link');
    }
  };

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

  if (!canQueryInvites) {
    return null;
  }

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
        <ScrollArea className="h-fit max-h-[50vh] **:data-[slot=table-container]:overflow-visible">
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
                    <TableCell className="text-muted-foreground">
                      {formatDate(invite.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontalIcon className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                void handleCopyInviteLink(invite);
                              }}
                            >
                              Copy link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setInviteToRevoke(invite);
                                setRevokeDialogOpen(true);
                              }}
                            >
                              Revoke
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
