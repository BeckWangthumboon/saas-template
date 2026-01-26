import { useForm } from '@tanstack/react-form';
import * as React from 'react';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useConvexMutation } from '@/hooks';

import { api } from '../../../convex/_generated/api';

const workspaceNameSchema = z
  .string()
  .min(1, 'Workspace name is required')
  .min(2, 'Workspace name must be at least 2 characters')
  .max(50, 'Workspace name must be at most 50 characters');

interface WorkspaceCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onSuccess: (workspaceId: string) => void;
  trigger?: React.ReactElement;
}

export function WorkspaceCreator({
  open,
  onOpenChange,
  defaultName = '',
  onSuccess,
  trigger,
}: WorkspaceCreatorProps) {
  const { mutate: createWorkspace, state } = useConvexMutation(api.workspace.createWorkspace);
  const isLoading = state.status === 'loading';

  const form = useForm({
    defaultValues: {
      name: defaultName,
    },
    onSubmit: async ({ value }) => {
      const result = await createWorkspace({ name: value.name.trim() });

      if (result.isOk()) {
        toast.success('Workspace created', {
          description: `"${value.name.trim()}" is ready to use.`,
        });
        onOpenChange(false);
        form.reset();
        onSuccess(result.value);
      } else {
        toast.error('Failed to create workspace', { description: result.error.message });
      }
    },
  });

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create workspace</DialogTitle>
        <DialogDescription>
          Give your workspace a name. You can change this later.
        </DialogDescription>
      </DialogHeader>
      <form
        id="create-workspace-form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="name"
          validators={{
            onBlur: ({ value }) => {
              const result = workspaceNameSchema.safeParse(value);
              if (result.success) return undefined;
              return result.error.issues[0].message;
            },
          }}
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Workspace name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  aria-invalid={isInvalid}
                  placeholder="My Workspace"
                  disabled={isLoading}
                  autoFocus
                  autoComplete="off"
                />
                {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
              </Field>
            );
          }}
        />
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" disabled={isLoading} />}>Cancel</DialogClose>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              form="create-workspace-form"
              disabled={!canSubmit || isSubmitting || isLoading}
            >
              {isLoading ? 'Creating...' : 'Create'}
            </Button>
          )}
        />
      </DialogFooter>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger render={trigger} />
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogContent}
    </Dialog>
  );
}
