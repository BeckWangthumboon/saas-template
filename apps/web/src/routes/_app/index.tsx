import { api } from '@saas/convex-api';
import { useForm } from '@tanstack/react-form';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { MailIcon, UserIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useConvexMutation, useConvexQuery } from '@/hooks';
import { defaultWorkspaceStorage } from '@/lib/storage';

export const Route = createFileRoute('/_app/')({
  component: OverviewPage,
});

function OverviewPage() {
  const navigate = useNavigate();
  const { status, data } = useConvexQuery(api.workspaces.index.getUserWorkspaces);
  const { mutate: ensureDefaultWorkspace, state: ensureDefaultWorkspaceState } = useConvexMutation(
    api.workspaces.index.ensureDefaultWorkspaceForCurrentUser,
  );
  const workspaces = useMemo(() => data ?? [], [data]);
  const defaultWorkspaceKey = useMemo(() => defaultWorkspaceStorage.get(), []);

  useEffect(() => {
    if (status !== 'success') return;
    if (workspaces.length === 0) return;

    const matched = workspaces.find((workspace) => workspace.workspaceKey === defaultWorkspaceKey);
    const target = matched ?? workspaces[0];
    void navigate({ to: `/w/${target.workspaceKey}` });
  }, [defaultWorkspaceKey, navigate, status, workspaces]);

  if (status !== 'success') {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (workspaces.length > 0) {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Redirecting to workspace...</p>
      </div>
    );
  }

  const handleContinueSolo = () => {
    if (ensureDefaultWorkspaceState.status === 'loading') return;

    void ensureDefaultWorkspace({}).then((result) => {
      if (result.isErr()) {
        return;
      }

      defaultWorkspaceStorage.set(result.value.workspaceKey);
      void navigate({ to: `/w/${result.value.workspaceKey}`, replace: true });
    });
  };

  return (
    <NoWorkspacesView
      onContinueSolo={handleContinueSolo}
      isCreatingSolo={ensureDefaultWorkspaceState.status === 'loading'}
      hasSetupError={ensureDefaultWorkspaceState.status === 'error'}
    />
  );
}

const inviteLinkSchema = z
  .string()
  .regex(/\/invite\/([a-zA-Z0-9_-]+)/, 'Please enter a valid invite link');

function extractInviteToken(link: string): string | null {
  const match = /\/invite\/([a-zA-Z0-9_-]+)/.exec(link);
  return match?.[1] ?? null;
}

function InviteLinkCard() {
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      inviteLink: '',
    },
    onSubmit: async ({ value }) => {
      const token = extractInviteToken(value.inviteLink.trim());
      if (token) {
        void navigate({ to: '/invite/$token', params: { token } });
      }
    },
  });

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center gap-3 pb-2">
          <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg shrink-0">
            <MailIcon className="text-muted-foreground h-5 w-5" />
          </div>
          <div>
            <CardTitle>Join a workspace</CardTitle>
            <CardDescription>Use an invite link to join an existing workspace.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-3"
        >
          <form.Field
            name="inviteLink"
            validators={{
              onBlur: ({ value }) => {
                const trimmed = value.trim();
                if (!trimmed) return 'Invite link is required';
                const result = inviteLinkSchema.safeParse(trimmed);
                if (result.success) return undefined;
                return result.error.issues[0].message;
              },
            }}
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                    }}
                    aria-invalid={isInvalid}
                    placeholder="Paste invite link here..."
                    autoComplete="off"
                  />
                  {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                </Field>
              );
            }}
          />

          <form.Subscribe
            selector={(state) => state.values.inviteLink}
            children={(inviteLink) => {
              const token = extractInviteToken(inviteLink.trim());

              return (
                <Button type="submit" className="w-full" disabled={!token}>
                  Join workspace
                </Button>
              );
            }}
          />
        </form>
      </CardContent>
    </Card>
  );
}

function StartPersonalWorkspaceCard({
  onContinueSolo,
  isCreatingSolo,
}: {
  onContinueSolo: () => void;
  isCreatingSolo: boolean;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center gap-3 pb-2">
          <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg shrink-0">
            <UserIcon className="text-muted-foreground h-5 w-5" />
          </div>
          <div>
            <CardTitle>Start your workspace</CardTitle>
            <CardDescription>
              Create a personal workspace to begin building right away.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <Button className="w-full" onClick={onContinueSolo} disabled={isCreatingSolo}>
          {isCreatingSolo ? 'Creating workspace...' : 'Create workspace'}
        </Button>
      </CardContent>
    </Card>
  );
}

function NoWorkspacesView({
  onContinueSolo,
  isCreatingSolo,
  hasSetupError,
}: {
  onContinueSolo: () => void;
  isCreatingSolo: boolean;
  hasSetupError: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-4xl items-center justify-center p-6">
      <div className="w-full space-y-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-2xl font-semibold tracking-tight">How would you like to start?</h1>
          <p className="text-muted-foreground mt-2">
            Create your own workspace or join an existing one with an invite link.
          </p>
          {hasSetupError && (
            <p className="text-destructive mt-3 text-sm">
              We couldn't create your workspace. Please try again.
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <StartPersonalWorkspaceCard
            onContinueSolo={onContinueSolo}
            isCreatingSolo={isCreatingSolo}
          />
          <InviteLinkCard />
        </div>
      </div>
    </div>
  );
}
