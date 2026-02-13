import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightIcon, type LucideIcon, SettingsIcon, UsersIcon } from 'lucide-react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  isWorkspaceEntitlementsReady,
  useWorkspace,
  useWorkspaceEntitlements,
} from '@/features/workspaces';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/')({
  component: OverviewPage,
});

interface WorkspacePage {
  title: string;
  description: string;
  slug: string;
  icon: LucideIcon;
}

interface WorkspacePageLink extends WorkspacePage {
  href: string;
}

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
] satisfies readonly WorkspacePage[];

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
  const pageLinks: WorkspacePageLink[] = visiblePages.map((page) => ({
    ...page,
    href: getWorkspacePath(`/${page.slug}`),
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">
          Welcome to your dashboard. Explore the available pages below.
        </p>
      </div>

      <OverviewVersionOne pageLinks={pageLinks} />
    </div>
  );
}

function OverviewVersionOne({ pageLinks }: { pageLinks: WorkspacePageLink[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pageLinks.map((page) => (
        <Link key={page.slug} to={page.href}>
          <Card className="h-full border-border/80 transition-colors hover:bg-muted/40">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between">
                <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
                  <page.icon className="size-4" />
                </div>
                <ArrowRightIcon className="text-muted-foreground size-4" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base">{page.title}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
