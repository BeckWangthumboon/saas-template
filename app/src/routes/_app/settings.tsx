import { useForm } from '@tanstack/react-form';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvex } from 'convex/react';
import { ArrowLeftIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUser } from '@/features/auth';
import { useConvexMutation } from '@/hooks';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const router = useRouter();
  const userContext = useUser();
  const user = userContext.status === 'ready' ? userContext.user : undefined;
  const { mutate: updateName } = useConvexMutation(api.users.index.updateName);
  const { mutate: deleteAccount, state: deleteState } = useConvexMutation(
    api.users.index.deleteAccount,
  );
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
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-xl space-y-8 p-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            router.history.back();
          }}
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Profile Header Banner */}
        <div className="flex flex-col items-center space-y-3 py-4">
          <Avatar className="h-24 w-24 text-2xl">
            <AvatarImage src={user.profilePictureUrl} alt={user.firstName ?? user.email} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-semibold">
              {user.firstName || user.lastName
                ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
                : 'No name set'}
            </h1>
            <p className="text-muted-foreground text-sm">{user.email}</p>
          </div>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your personal information.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Danger Zone Card */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible and destructive actions.</CardDescription>
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
                <DialogTrigger render={<Button variant="destructive" />}>Delete</DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete your account?</DialogTitle>
                    <DialogDescription>
                      This action cannot be undone. This will delete your account and all your data
                      will be removed from our servers.
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
    </ScrollArea>
  );
}
