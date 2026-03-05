import type { useNavigate } from '@tanstack/react-router';
import {
  ChevronDownIcon,
  LogOutIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
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
  workspaceKey: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onNavigate: ReturnType<typeof useNavigate>;
  onSignOut?: () => void;
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspace,
  onNavigate,
  onSignOut,
}: WorkspaceSwitcherProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  const handleWorkspaceChange = (workspaceKey: string) => {
    void onNavigate({ to: `/w/${workspaceKey}` });
  };

  const handleThemeToggle = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
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
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="shadow-lg">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Workspace
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onNavigate({ to: `/w/${currentWorkspace.workspaceKey}/profile` })}
          >
            <SettingsIcon className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleThemeToggle}>
            {isDarkMode ? (
              <SunIcon className="mr-2 h-4 w-4" />
            ) : (
              <MoonIcon className="mr-2 h-4 w-4" />
            )}
            Switch to {isDarkMode ? 'light' : 'dark'} mode
          </DropdownMenuItem>
          {onSignOut && (
            <>
              <DropdownMenuItem onClick={onSignOut}>
                <LogOutIcon className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkspaceCreator
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={(workspaceKey) => {
          void onNavigate({ to: `/w/${workspaceKey}` });
        }}
      />
    </>
  );
}
