import { MoreHorizontalIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useDebounce } from '@/hooks';

import type { Id } from '../../../convex/_generated/dataModel';
import { MemberRoleChangeDialog } from './MemberRoleChangeDialog';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import type { Member, Role } from './types';
import { formatDate, formatName, getInitials, getRoleBadgeVariant } from './utils';

interface WorkspaceMembersTableProps {
  members: Member[];
  isLoading?: boolean;
  currentUserId: Id<'users'>;
  currentUserRole: Role;
  workspaceId: Id<'workspaces'>;
}

export function WorkspaceMembersTable({
  members,
  isLoading = false,
  currentUserId,
  currentUserRole,
  workspaceId,
}: WorkspaceMembersTableProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [memberToChangeRole, setMemberToChangeRole] = useState<Member | null>(null);
  const headerCellClassName = 'sticky top-0 z-10 bg-background';

  const filteredMembers = members.filter((m) =>
    [m.firstName, m.lastName, m.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(debouncedSearch.toLowerCase()),
  );

  const canManageMember = (member: Member): boolean => {
    if (member._id === currentUserId) return false;
    if (currentUserRole === 'owner') return true;
    if (currentUserRole === 'admin') return member.role === 'member';
    return false;
  };

  const canChangeRole = (member: Member): boolean => {
    if (currentUserRole === 'owner') return true;
    if (currentUserRole === 'admin') {
      if (member._id === currentUserId) return true;
      return member.role === 'member';
    }
    return false;
  };

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading members...</p>;
  }

  if (members.length === 0) {
    return <p className="text-muted-foreground text-sm">No members found.</p>;
  }

  return (
    <>
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search members..."
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
                <TableHead className={headerCellClassName}>Member</TableHead>
                <TableHead className={headerCellClassName}>Role</TableHead>
                <TableHead className={headerCellClassName}>Joined</TableHead>
                <TableHead className={`${headerCellClassName} w-12`}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-center py-6">
                    No members found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member) => (
                  <TableRow key={member._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          {member.profilePictureUrl && (
                            <AvatarImage src={member.profilePictureUrl} alt="" />
                          )}
                          <AvatarFallback>
                            {getInitials(member.firstName, member.lastName, member.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {formatName(member.firstName, member.lastName) || member.email}
                            {member._id === currentUserId && (
                              <span className="text-muted-foreground ml-1">(you)</span>
                            )}
                          </span>
                          {(member.firstName ?? member.lastName) && (
                            <span className="text-muted-foreground text-sm">{member.email}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(member.role)} className="capitalize">
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(member.joinedAt)}
                    </TableCell>
                    <TableCell>
                      {(canManageMember(member) || canChangeRole(member)) && (
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
                              {canChangeRole(member) && (
                                <DropdownMenuItem
                                  className="whitespace-nowrap"
                                  onClick={() => {
                                    setMemberToChangeRole(member);
                                    setRoleDialogOpen(true);
                                  }}
                                >
                                  Change role
                                </DropdownMenuItem>
                              )}
                              {canManageMember(member) && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="whitespace-nowrap"
                                  onClick={() => {
                                    setMemberToRemove(member);
                                    setRemoveDialogOpen(true);
                                  }}
                                >
                                  Remove Member
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <RemoveMemberDialog
        workspaceId={workspaceId}
        member={memberToRemove}
        open={removeDialogOpen}
        onOpenChange={(open) => {
          setRemoveDialogOpen(open);
          if (!open) setMemberToRemove(null);
        }}
      />

      <MemberRoleChangeDialog
        workspaceId={workspaceId}
        member={memberToChangeRole}
        callerRole={currentUserRole}
        currentUserId={currentUserId}
        open={roleDialogOpen}
        onOpenChange={(open) => {
          setRoleDialogOpen(open);
          if (!open) setMemberToChangeRole(null);
        }}
      />
    </>
  );
}
