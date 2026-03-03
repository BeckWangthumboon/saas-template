import { useForm } from '@tanstack/react-form';
import { CheckIcon, CopyIcon, SendIcon, UserPlusIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { formatInviteLink } from './utils';

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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [successData, setSuccessData] = useState<{
    link: string;
    email: string;
    wasResent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (!value) {
        setSuccessData(null);
        setCopied(false);
        setCopyError(false);
      }
      if (isControlled) {
        controlledOnOpenChange(value);
      } else {
        setUncontrolledOpen(value);
      }
    },
    [isControlled, controlledOnOpenChange],
  );

  const { mutate: createInvite, state: createState } = useConvexMutation(
    api.workspaces.invites.createInvite,
  );
  const isCreating = createState.status === 'loading';

  const form = useForm({
    defaultValues: {
      email: '',
      role: 'member' as 'admin' | 'member',
    },
    onSubmit: async ({ value }) => {
      if (callerRole === 'member') return;
      const result = await createInvite({
        workspaceId,
        email: value.email.trim().toLowerCase(),
        inviteeRole: value.role.toLowerCase() as 'admin' | 'member',
      });

      if (result.isOk()) {
        const link = formatInviteLink(result.value.token);
        setSuccessData({
          link,
          email: value.email.trim(),
          wasResent: result.value.wasResent,
        });
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
        } else if (result.error.code === ErrorCode.BILLING_PLAN_REQUIRED) {
          toast.error('Upgrade required', {
            description: 'Inviting teammates requires a Pro plan.',
          });
        } else if (result.error.code === ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED) {
          toast.error('Plan limit reached', {
            description: 'Your workspace has reached its current member or invite limit.',
          });
        } else if (result.error.code === ErrorCode.BILLING_WORKSPACE_LOCKED) {
          toast.error('Billing action required', {
            description: 'Workspace access is restricted until billing is resolved.',
          });
        } else if (result.error.code === ErrorCode.INVITE_CREATE_RATE_LIMITED) {
          toast.error('Too many invite attempts', {
            description: 'Please wait a moment before sending more invitations.',
          });
        } else if (result.error.code === ErrorCode.INVITE_EMAIL_SCHEDULE_FAILED) {
          toast.error('Invitation email failed', {
            description: 'We could not schedule the invitation email. Please try again.',
          });
        } else {
          toast.error('Failed to send invitation', { description: result.error.message });
        }
      }
    },
  });

  const canInviteAdmin = callerRole === 'owner';
  const roleLabelByValue = {
    admin: 'Admin',
    member: 'Member',
  } as const;

  const handleCopyLink = async () => {
    if (!successData) return;
    try {
      await navigator.clipboard.writeText(successData.link);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopyError(true);
    }
  };

  const successContent = successData && (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{successData.wasResent ? 'Invitation resent' : 'Invitation sent'}</DialogTitle>
        <DialogDescription>
          An invitation email has been sent to {successData.email}. You can also share the link
          below.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <FieldLabel>Invite link</FieldLabel>
        <div className="flex gap-2">
          <Input
            value={successData.link}
            readOnly
            onFocus={(e) => {
              e.currentTarget.select();
            }}
            aria-label="Invite link"
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => void handleCopyLink()}
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        {copyError && (
          <p className="text-destructive text-sm">
            Failed to copy. Please select and copy the link manually.
          </p>
        )}
      </div>

      <DialogFooter className="mt-6">
        <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
      </DialogFooter>
    </DialogContent>
  );

  const formContent = (
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
                const emailResult = z.email().safeParse(trimmed);
                if (!emailResult.success) return 'Invalid email address';
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
                    if (value === 'admin' || value === 'member') {
                      field.handleChange(value);
                    }
                  }}
                  disabled={isCreating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value) =>
                        value
                          ? roleLabelByValue[value as keyof typeof roleLabelByValue]
                          : 'Select a role'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    {canInviteAdmin && <SelectItem value="admin">Admin</SelectItem>}
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
      {successData ? successContent : formContent}
    </Dialog>
  );
}
