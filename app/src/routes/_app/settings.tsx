import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvex, useQuery } from 'convex/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useConvexAction, useConvexMutation } from '@/hooks';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const user = useQuery(api.user.getUserOrNull);
  const { mutate: updateName } = useConvexMutation(api.user.updateName);
  const { execute: deleteAccount, state: deleteState } = useConvexAction(api.user.deleteAccount);
  const { signOut } = useAuth();
  const convex = useConvex();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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

  const handleDeleteAccount = async () => {
    const result = await deleteAccount();

    if (result.isErr()) {
      toast.error('Failed to delete account', {
        description: result.error.message,
      });
      return;
    }

    setDeleteDialogOpen(false);

    try {
      await signOut({ navigate: false });
    } catch (error) {
      console.error(error);
    }
    convex.clearAuth();
    window.location.href = '/sign-in';
  };

  if (user === undefined) {
    return (
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground mt-1">Signing out...</p>
        </div>
      </div>
    );
  }

  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    user.email[0].toUpperCase();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and preferences.</p>
      </div>

      <div className="space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal information.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* User display */}
            <div className="flex items-center gap-4 mb-6">
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

            {/* Name form */}
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

                <FieldSeparator />

                <Field orientation="horizontal">
                  <Button type="submit" form="profile-form">
                    Save Changes
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        {/* Danger Zone Card */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions. Please proceed with caution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Account</p>
                <p className="text-muted-foreground text-sm">
                  Permanently delete your account and all associated data.
                </p>
              </div>
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogTrigger render={<Button variant="destructive" />}>
                  Delete Account
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete your account?</DialogTitle>
                    <DialogDescription>
                      This action cannot be undone. This will permanently delete your account and
                      remove all your data from our servers.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" disabled={isDeleting} />}>
                      Cancel
                    </DialogClose>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Account'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
