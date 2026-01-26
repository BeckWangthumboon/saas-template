import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/settings/')({
  component: SettingsIndex,
});

function SettingsIndex() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: `/workspaces/${workspaceId}/settings/workspace`, replace: true });
  }, [navigate, workspaceId]);

  return null;
}
