import { createFileRoute } from '@tanstack/react-router';

import { ScrollArea } from '@/components/ui/scroll-area';
import { ProfilePage } from '@/features/auth/ProfilePage';

export const Route = createFileRoute('/_app/settings')({
  component: ProfileSettingsRoute,
});

function ProfileSettingsRoute() {
  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        <ProfilePage />
      </div>
    </ScrollArea>
  );
}
