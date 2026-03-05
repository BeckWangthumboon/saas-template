import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/_app/w/$workspaceKey/settings/')({
  component: SettingsIndex,
});

function SettingsIndex() {
  const { workspaceKey } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: `/w/${workspaceKey}/settings/workspace`, replace: true });
  }, [navigate, workspaceKey]);

  return null;
}
