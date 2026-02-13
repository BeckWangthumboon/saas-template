import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightIcon, SettingsIcon, UsersIcon } from 'lucide-react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  isWorkspaceEntitlementsReady,
  useWorkspace,
  useWorkspaceEntitlements,
} from '@/features/workspaces';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/')({
  component: OverviewPage,
});

const pages = [
  {
    title: 'Contacts',
    description: 'Create and manage contacts with simple CRUD flows.',
    slug: 'contacts',
    icon: UsersIcon,
  },
  {
    title: 'Members',
    description: 'Manage workspace members and their permissions.',
    slug: 'members',
    icon: UsersIcon,
  },
  {
    title: 'Settings',
    description: 'Manage workspace details, profile, and access.',
    slug: 'settings',
    icon: SettingsIcon,
  },
] as const;

function OverviewPage() {
  const { getWorkspacePath } = useWorkspace();
  const entitlementsContext = useWorkspaceEntitlements();

  if (!isWorkspaceEntitlementsReady(entitlementsContext)) {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  const visiblePages = entitlementsContext.canAccessMembersPage
    ? pages
    : pages.filter((page) => page.slug !== 'members');

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground mt-1">
          Welcome to your dashboard. Explore the available pages below.
        </p>
      </div>

      <div className="grid gap-4">
        {visiblePages.map((page) => {
          const href = getWorkspacePath(`/${page.slug}`);

          return (
            <Link key={page.slug} to={href}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="flex-row items-center gap-4">
                  <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <page.icon className="size-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{page.title}</CardTitle>
                    <CardDescription>{page.description}</CardDescription>
                  </div>
                  <ArrowRightIcon className="size-5 text-muted-foreground" />
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
