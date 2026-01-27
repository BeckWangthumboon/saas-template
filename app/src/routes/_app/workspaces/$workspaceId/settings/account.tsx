import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvex } from 'convex/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useUser } from '@/features/auth';
import { useConvexAction, useConvexMutation } from '@/hooks';

import { api } from '../../../../../../convex/_generated/api';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/settings/account')({
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  const userContext = useUser();
  const user = userContext.status === 'ready' ? userContext.user : undefined;
  const { mutate: updateName } = useConvexMutation(api.user.updateName);
  const { execute: deleteAccount, state: deleteState } = useConvexAction(api.user.deleteAccount);
  const { signOut } = useAuth();
  const convex = useConvex();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isDeleting = deleteState.status === 'loading';

  const form = useForm({
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
    },
    onSubmit: async ({ value }) => {
      const result = await updateName({
        firstName: value.firstName || undefined,
        lastName: value.lastName || undefined,
      });

      if (result.isOk()) {
        toast.success('Profile updated', {
          description: 'Your name has been updated successfully.',
        });
      } else {
        toast.error('Failed to update profile', {
          description: result.error.message,
        });
      }
    },
  });

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';
  const hasUser = user != null;

  useEffect(() => {
    if (!hasUser) return;
    form.reset({
      firstName,
      lastName,
    });
  }, [firstName, form, hasUser, lastName]);

  const handleDeleteAccount = async () => {
    const result = await deleteAccount();

    if (result.isErr()) {
      toast.error('Failed to delete account', {
        description: result.error.message,
      });
      return;
    }

    convex.clearAuth();
    setIsSigningOut(true);
    setDeleteDialogOpen(false);

    void signOut({ navigate: false }).catch((error: unknown) => {
      console.error(error);
    });
    window.location.href = '/sign-in';
  };

  if (!user || isSigningOut) {
    return <p className="text-muted-foreground">Loading account...</p>;
  }

  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    user.email[0].toUpperCase();

  return (
    <div className="max-w-2xl space-y-10">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="text-muted-foreground text-sm">Manage your profile and account data.</p>
      </div>

      {/* Profile Section */}
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Profile</h2>
          <p className="text-muted-foreground text-sm">Update your personal information.</p>
        </div>

        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage src={user.profilePictureUrl} alt={user.firstName ?? user.email} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">
              {user.firstName || user.lastName
                ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
                : 'No name set'}
            </p>
            <p className="text-muted-foreground text-sm">{user.email}</p>
          </div>
        </div>

        <form
          id="profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="firstName"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>First Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      aria-invalid={isInvalid}
                      placeholder="John"
                      autoComplete="given-name"
                    />
                    <FieldDescription>
                      Your first name as it will appear on your profile.
                    </FieldDescription>
                    {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                  </Field>
                );
              }}
            />

            <form.Field
              name="lastName"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Last Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      aria-invalid={isInvalid}
                      placeholder="Doe"
                      autoComplete="family-name"
                    />
                    <FieldDescription>
                      Your last name as it will appear on your profile.
                    </FieldDescription>
                    {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                  </Field>
                );
              }}
            />

            <div className="pt-2">
              <Button type="submit" form="profile-form">
                Save Changes
              </Button>
            </div>
          </FieldGroup>
        </form>
      </section>

      {/* Danger Zone Section */}
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-destructive">Danger Zone</h1>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Delete Account</p>
            <p className="text-muted-foreground text-sm">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger render={<Button variant="destructive" />}>Delete Account</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete your account and remove
                  all your data from our servers.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={isDeleting} />}>
                  Cancel
                </DialogClose>
                <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete Account'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  );
}
