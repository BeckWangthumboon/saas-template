import type { useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { WorkspaceCreator } from './WorkspaceCreator';

interface Workspace {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onNavigate: ReturnType<typeof useNavigate>;
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspace,
  onNavigate,
}: WorkspaceSwitcherProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleWorkspaceChange = (workspaceId: string) => {
    void onNavigate({ to: `/workspaces/${workspaceId}` });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-3 py-2 transition-colors',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          )}
        >
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-sm font-medium text-foreground">
              {currentWorkspace.name}
            </div>
            <div className="text-xs capitalize">{currentWorkspace.role}</div>
          </div>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={currentWorkspace.id}
              onValueChange={handleWorkspaceChange}
            >
              {workspaces.map((ws) => (
                <DropdownMenuRadioItem key={ws.id} value={ws.id}>
                  {ws.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkspaceCreator
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={(workspaceId) => {
          void onNavigate({ to: `/workspaces/${workspaceId}` });
        }}
      />
    </>
  );
}
