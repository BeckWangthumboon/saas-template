import type { useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Workspace {
  id: string;
  workspaceKey: string;
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
  const handleWorkspaceChange = (workspaceKey: string) => {
    void onNavigate({ to: `/w/${workspaceKey}` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 transition-colors',
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        )}
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="line-clamp-2 text-sm font-medium text-foreground">
            {currentWorkspace.name}
          </div>
        </div>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" sideOffset={8} className="shadow-lg">
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={currentWorkspace.workspaceKey}
            onValueChange={handleWorkspaceChange}
          >
            {workspaces.map((ws) => (
              <DropdownMenuRadioItem key={ws.id} value={ws.workspaceKey}>
                <span className="line-clamp-2 block" title={ws.name}>
                  {ws.name}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
