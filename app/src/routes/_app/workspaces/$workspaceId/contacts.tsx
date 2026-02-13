import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { isWorkspaceReady, useWorkspace } from '@/features/workspaces';
import { useConvexMutation, useConvexQuery } from '@/hooks';

import { api } from '../../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../../convex/_generated/dataModel';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/contacts')({
  component: ContactsPage,
});

const OPTIONAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_CONTACT_FORM_VALUES = {
  name: '',
  email: '',
  notes: '',
};
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type Contact = Doc<'contacts'>;

/**
 * Validates optional email input and returns an error message when invalid.
 */
function validateOptionalEmail(value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (!OPTIONAL_EMAIL_REGEX.test(trimmed)) {
    return 'Enter a valid email address';
  }

  return undefined;
}

/**
 * Formats a contact update timestamp for table display.
 */
function formatUpdatedAt(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp));
}

function ContactsPage() {
  const workspaceContext = useWorkspace();

  if (!isWorkspaceReady(workspaceContext)) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading contacts...</p>
      </div>
    );
  }

  return <ContactsPageContent workspaceId={workspaceContext.workspaceId as Id<'workspaces'>} />;
}

function ContactsPageContent({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const { status: contactsStatus, data: contactsData } = useConvexQuery(
    api.contacts.index.listContacts,
    {
      workspaceId,
    },
  );
  const { mutate: createContact, state: createState } = useConvexMutation(
    api.contacts.index.createContact,
  );
  const { mutate: updateContact, state: updateState } = useConvexMutation(
    api.contacts.index.updateContact,
  );
  const { mutate: deleteContact, state: deleteState } = useConvexMutation(
    api.contacts.index.deleteContact,
  );
  const [editingContactId, setEditingContactId] = useState<Id<'contacts'> | null>(null);

  const contacts = useMemo<Contact[]>(() => contactsData ?? [], [contactsData]);
  const editingContact = useMemo(
    () => contacts.find((contact) => contact._id === editingContactId) ?? null,
    [contacts, editingContactId],
  );
  const isEditing = editingContact !== null;
  const isLoadingContacts = contactsStatus === 'loading';
  const isMutating = createState.status === 'loading' || updateState.status === 'loading';

  const form = useForm({
    defaultValues: EMPTY_CONTACT_FORM_VALUES,
    onSubmit: async ({ value }) => {
      const payload = {
        workspaceId,
        name: value.name.trim(),
        email: value.email.trim() || undefined,
        notes: value.notes.trim() || undefined,
      };

      const result = isEditing
        ? await updateContact({
            workspaceId,
            contactId: editingContact._id,
            name: payload.name,
            email: payload.email,
            notes: payload.notes,
          })
        : await createContact(payload);

      if (result.isErr()) {
        toast.error(isEditing ? 'Failed to update contact' : 'Failed to create contact', {
          description: result.error.message,
        });
        return;
      }

      toast.success(isEditing ? 'Contact updated' : 'Contact created');
      setEditingContactId(null);
      form.reset(EMPTY_CONTACT_FORM_VALUES);
    },
  });

  useEffect(() => {
    if (!editingContact) {
      form.reset(EMPTY_CONTACT_FORM_VALUES);
      return;
    }

    form.reset({
      name: editingContact.name,
      email: editingContact.email ?? '',
      notes: editingContact.notes ?? '',
    });
  }, [editingContact, form]);

  const handleEditContact = (contact: Contact) => {
    setEditingContactId(contact._id);
  };

  const handleCancelEdit = () => {
    setEditingContactId(null);
    form.reset(EMPTY_CONTACT_FORM_VALUES);
  };

  const handleDeleteContact = async (contact: Contact) => {
    const confirmed = window.confirm(`Delete ${contact.name}? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    const result = await deleteContact({
      workspaceId,
      contactId: contact._id,
    });

    if (result.isErr()) {
      toast.error('Failed to delete contact', {
        description: result.error.message,
      });
      return;
    }

    if (editingContactId === contact._id) {
      handleCancelEdit();
    }

    toast.success('Contact deleted');
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Contacts</h1>
        <p className="text-muted-foreground text-sm">
          A simple CRUD starter pack for contact data.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="text-base font-medium">{isEditing ? 'Edit Contact' : 'Add Contact'}</h2>
          <p className="text-muted-foreground text-sm">
            Name is required. Email and notes are optional.
          </p>
        </div>

        <form
          id="contact-form"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) => {
                  if (!value.trim()) {
                    return 'Name is required';
                  }

                  return undefined;
                },
              }}
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                      }}
                      placeholder="Alex Morgan"
                      aria-invalid={isInvalid}
                      disabled={isMutating}
                    />
                    {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                  </Field>
                );
              }}
            />

            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) => validateOptionalEmail(value),
              }}
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                      }}
                      placeholder="alex@example.com"
                      autoComplete="email"
                      aria-invalid={isInvalid}
                      disabled={isMutating}
                    />
                    {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                  </Field>
                );
              }}
            />

            <form.Field
              name="notes"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                    }}
                    placeholder="Optional notes about this contact"
                    disabled={isMutating}
                  />
                  <FieldDescription>Keep this short and actionable.</FieldDescription>
                </Field>
              )}
            />

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" form="contact-form" disabled={isMutating}>
                {isMutating
                  ? isEditing
                    ? 'Saving...'
                    : 'Creating...'
                  : isEditing
                    ? 'Save Contact'
                    : 'Add Contact'}
              </Button>

              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isMutating}
                >
                  Cancel
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-medium">Contact List</h2>
          <p className="text-muted-foreground text-sm">Create, edit, and delete contacts.</p>
        </div>

        {isLoadingContacts ? (
          <p className="text-muted-foreground text-sm">Loading contacts...</p>
        ) : contacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No contacts yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="min-w-64">Notes</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact._id}>
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell>{contact.email ?? '—'}</TableCell>
                  <TableCell className="max-w-md whitespace-normal text-sm text-muted-foreground">
                    {contact.notes ?? '—'}
                  </TableCell>
                  <TableCell>{formatUpdatedAt(contact.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          handleEditContact(contact);
                        }}
                        disabled={deleteState.status === 'loading'}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          void handleDeleteContact(contact);
                        }}
                        disabled={deleteState.status === 'loading'}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
