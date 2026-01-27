import { useForm } from '@tanstack/react-form';
import { SendIcon, UserPlusIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConvexMutation } from '@/hooks';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ErrorCode } from '../../../shared/errors';
import type { Role } from './types';

interface InviteMemberDialogProps {
  workspaceId: Id<'workspaces'>;
  callerRole: Role;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
}

export function InviteMemberDialog({
  workspaceId,
  callerRole,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: InviteMemberDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback(
    (value: boolean) => {
      if (isControlled) {
        controlledOnOpenChange(value);
      } else {
        setUncontrolledOpen(value);
      }
    },
    [isControlled, controlledOnOpenChange],
  );

  const { mutate: createInvite, state: createState } = useConvexMutation(api.invite.createInvite);
  const isCreating = createState.status === 'loading';

  const form = useForm({
    defaultValues: {
      email: '',
      role: 'member' as 'admin' | 'member',
    },
    onSubmit: async ({ value }) => {
      const result = await createInvite({
        workspaceId,
        email: value.email.trim().toLowerCase(),
        inviteeRole: value.role,
      });

      if (result.isOk()) {
        const { wasResent } = result.value;
        toast.success(wasResent ? 'Invitation resent' : 'Invitation sent', {
          description: wasResent
            ? `The invitation to ${value.email} has been refreshed.`
            : `An invitation has been sent to ${value.email}.`,
        });
        setOpen(false);
        form.reset();
      } else {
        if (result.error.code === ErrorCode.INVITE_ALREADY_MEMBER) {
          toast.error('Already a member', {
            description: `${value.email} is already a member of this workspace.`,
          });
        } else if (result.error.code === ErrorCode.INVITE_SELF_INVITE) {
          toast.error('Cannot invite yourself', {
            description: 'You cannot send an invitation to yourself.',
          });
        } else {
          toast.error('Failed to send invitation', { description: result.error.message });
        }
      }
    },
  });

  const canInviteAdmin = callerRole === 'owner';

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invite a new member</DialogTitle>
        <DialogDescription>
          Send an invitation to join this workspace. They will receive an email with a link to join.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field
            name="email"
            validators={{
              onBlur: ({ value }) => {
                const trimmed = value.trim();
                if (!trimmed) return 'Email is required';
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Invalid email address';
                return undefined;
              },
            }}
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                    }}
                    aria-invalid={isInvalid}
                    placeholder="colleague@example.com"
                    autoComplete="off"
                    disabled={isCreating}
                  />
                  {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                </Field>
              );
            }}
          />

          <form.Field
            name="role"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Role</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => {
                    if (value) field.handleChange(value);
                  }}
                  disabled={isCreating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Member">Member</SelectItem>
                    {canInviteAdmin && <SelectItem value="Admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </FieldGroup>

        <DialogFooter className="mt-6">
          <DialogClose render={<Button variant="outline" disabled={isCreating} />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            disabled={!form.state.canSubmit || form.state.isSubmitting || isCreating}
          >
            <SendIcon className="size-4" />
            {isCreating ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  const defaultTrigger = (
    <Button size="sm">
      <UserPlusIcon className="size-4" />
      Invite Member
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      {dialogContent}
    </Dialog>
  );
}
