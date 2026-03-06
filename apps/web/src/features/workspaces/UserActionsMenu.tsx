import type { useNavigate } from '@tanstack/react-router';
import { LogOutIcon, MoonIcon, PlusIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isUserReady, useUser } from '@/features/auth/UserContext';
import { cn } from '@/lib/utils';

import { WorkspaceCreator } from './WorkspaceCreator';

interface Workspace {
  workspaceKey: string;
}

interface UserActionsMenuProps {
  currentWorkspace: Workspace;
  onNavigate: ReturnType<typeof useNavigate>;
  onSignOut?: () => void;
}

function getUserInitials(firstName?: string | null, lastName?: string | null, email?: string) {
  const fromName = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase();
  return fromName !== '' ? fromName : (email?.charAt(0).toUpperCase() ?? '?');
}

export function UserActionsMenu({ currentWorkspace, onNavigate, onSignOut }: UserActionsMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const userContext = useUser();
  const user = isUserReady(userContext) ? userContext.user : null;

  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const displayName = fullName !== '' ? fullName : (user?.email ?? '');

  const initials = getUserInitials(user?.firstName, user?.lastName, user?.email);

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
          <Avatar className="size-6 shrink-0">
            <AvatarImage src={user?.profilePictureUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-sm font-medium text-foreground">{displayName}</div>
            {user?.email && displayName !== user.email && (
              <div className="truncate text-xs">{user.email}</div>
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="shadow-lg">
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
              <DropdownMenuSeparator />
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
