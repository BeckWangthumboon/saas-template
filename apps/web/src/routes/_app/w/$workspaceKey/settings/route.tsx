import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspace } from '@/features/workspaces';
import { WorkspacePageHeading } from '@/features/workspaces';

export const Route = createFileRoute('/_app/w/$workspaceKey/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const navigate = Route.useNavigate();
  const { getWorkspacePath } = useWorkspace();
  const location = useLocation();

  const sections = [
    {
      label: 'Workspace',
      href: getWorkspacePath('/settings/workspace'),
    },
    {
      label: 'Billing',
      href: getWorkspacePath('/settings/billing'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeading title="Settings" />
      <Tabs value={location.pathname} onValueChange={(value) => navigate({ to: value })}>
        <TabsList variant="card" className="justify-start">
          {sections.map((section) => (
            <TabsTrigger
              key={section.href}
              value={section.href}
              className="px-3 py-1 text-sm font-medium"
            >
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="flex-1 min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
