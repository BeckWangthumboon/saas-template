import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import { ErrorCode } from '@saas/shared/errors';
import { useForm } from '@tanstack/react-form';
import { CheckIcon, CopyIcon, SendIcon, UserPlusIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useConvexMutation, useConvexQuery } from '@/hooks';

import type { Role } from './types';
import { formatInviteLink } from './utils';

interface InviteMemberDialogProps {
  workspaceId: Id<'workspaces'>;
  callerRole: Role;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
}

function showInviteErrorToast(errorCode: string, email: string, fallbackMessage?: string) {
  if (errorCode === ErrorCode.INVITE_ALREADY_MEMBER) {
    toast.error('Already a member', {
      description: `${email} is already a member of this workspace.`,
    });
    return;
  }

  if (errorCode === ErrorCode.INVITE_SELF_INVITE) {
    toast.error('Cannot invite yourself', {
      description: 'You cannot send an invitation to yourself.',
    });
    return;
  }

  if (errorCode === ErrorCode.BILLING_PLAN_REQUIRED) {
    toast.error('Upgrade required', {
      description: 'Inviting teammates requires a Pro plan.',
    });
    return;
  }

  if (errorCode === ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED) {
    toast.error('Plan limit reached', {
      description: 'Your workspace has reached its current member or invite limit.',
    });
    return;
  }

  if (errorCode === ErrorCode.BILLING_WORKSPACE_LOCKED) {
    toast.error('Billing action required', {
      description: 'Workspace access is restricted until billing is resolved.',
    });
    return;
  }

  if (errorCode === ErrorCode.INVITE_CREATE_RATE_LIMITED) {
    toast.error('Too many invite attempts', {
      description: 'Please wait a moment before sending more invitations.',
    });
    return;
  }

  if (errorCode === ErrorCode.INVITE_EMAIL_SCHEDULE_FAILED) {
    toast.error('Invitation email failed', {
      description: 'We could not schedule the invitation email. Please try again.',
    });
    return;
  }

  toast.error('Failed to send invitation', {
    description: fallbackMessage ?? 'Something went wrong while sending the invitation.',
  });
}

export function InviteMemberDialog({
  workspaceId,
  callerRole,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: InviteMemberDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<Id<'inviteRequests'> | null>(null);
  const [pendingInviteEmail, setPendingInviteEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const handledFailedRequestIdRef = useRef<Id<'inviteRequests'> | null>(null);

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const { mutate: createInvite, state: createState } = useConvexMutation(
    api.workspaces.invites.createInvite,
  );
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
        setPendingInviteEmail(value.email.trim());
        setCopied(false);
        setCopyError(false);
        handledFailedRequestIdRef.current = null;
        setPendingRequestId(result.value.requestId);
      } else {
        showInviteErrorToast(result.error.code, value.email.trim(), result.error.message);
      }
    },
  });
  const setOpen = useCallback(
    (value: boolean) => {
      if (!value) {
        setPendingRequestId(null);
        setPendingInviteEmail('');
        setCopied(false);
        setCopyError(false);
        handledFailedRequestIdRef.current = null;
        form.reset();
      }
      if (isControlled) {
        controlledOnOpenChange(value);
      } else {
        setUncontrolledOpen(value);
      }
    },
    [form, isControlled, controlledOnOpenChange],
  );
  const createInviteRequest = useConvexQuery(
    api.workspaces.invites.getCreateInviteRequest,
    pendingRequestId ? { requestId: pendingRequestId } : 'skip',
  );
  const isProcessingInviteRequest =
    pendingRequestId !== null &&
    (createInviteRequest.status === 'loading' ||
      (createInviteRequest.status === 'success' && createInviteRequest.data.status === 'pending'));
  const isCreating = createState.status === 'loading' || isProcessingInviteRequest;
  const successData =
    pendingRequestId !== null &&
    createInviteRequest.status === 'success' &&
    createInviteRequest.data.status === 'completed'
      ? {
          link: formatInviteLink(createInviteRequest.data.token),
          email: createInviteRequest.data.email,
          wasResent: createInviteRequest.data.wasResent,
        }
      : null;

  useEffect(() => {
    if (pendingRequestId === null || createInviteRequest.status !== 'success') {
      return;
    }

    if (
      createInviteRequest.data.status === 'failed' &&
      handledFailedRequestIdRef.current !== pendingRequestId
    ) {
      showInviteErrorToast(createInviteRequest.data.errorCode, pendingInviteEmail);
      handledFailedRequestIdRef.current = pendingRequestId;
    }
  }, [createInviteRequest, pendingInviteEmail, pendingRequestId]);

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
