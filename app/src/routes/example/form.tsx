/**
 * EXAMPLE FORM - Delete this file when building your app
 *
 * This demonstrates the form pattern using:
 * - TanStack Form for state management
 * - Inline validators
 * - shadcn/ui Field components for accessible forms
 * - onBlur validation mode (validates when user leaves a field)
 *
 * Field styles demonstrated:
 * 1. Input (text) - basic text input
 * 2. Textarea - multi-line input
 * 3. Select - dropdown selection
 * 4. Checkbox group - multiple selections
 * 5. Radio group - single selection from options
 * 6. Switch - toggle with horizontal layout
 * 7. Slider - range input
 *
 * Copy this pattern when building forms in your app.
 */

import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/example/form')({
  component: ExampleFormPage,
});

/**
 * Options for select, checkbox, and radio fields
 * In a real app, these might come from an API or config
 */
const roleOptions = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Admin' },
] as const;

const notificationOptions = [
  { value: 'email', label: 'Email notifications' },
  { value: 'push', label: 'Push notifications' },
  { value: 'slack', label: 'Slack notifications' },
] as const;

const visibilityOptions = [
  { value: 'private', label: 'Private', description: 'Only you can access' },
  { value: 'team', label: 'Team', description: 'All workspace members' },
  { value: 'public', label: 'Public', description: 'Anyone with the link' },
] as const;

function ExampleFormPage() {
  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      defaultRole: '',
      notifications: [] as string[],
      visibility: '',
      autoArchive: false,
      retentionDays: [30],
    },
    onSubmit: async ({ value }) => {
      // In a real app, this would call your API
      console.log('Form submitted:', value);
      toast.success('Settings saved!', {
        description: 'Your workspace settings have been updated.',
      });
    },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Workspace Settings</h1>
        <p className="text-muted-foreground mt-1">
          Example form demonstrating all field patterns. Delete this when building your app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Configure your workspace settings and preferences.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="workspace-settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              {/* ===== INPUT FIELD ===== */}
              <form.Field
                name="name"
                validators={{
                  onBlur: ({ value }) => {
                    if (!value) return 'Workspace name is required';
                    if (value.length < 3) return 'Workspace name must be at least 3 characters';
                    if (value.length > 50) return 'Workspace name must be at most 50 characters';
                    return undefined;
                  },
                }}
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Workspace Name</FieldLabel>
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
                        autoComplete="off"
                      />
                      <FieldDescription>This is your workspace's display name.</FieldDescription>
                      {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                    </Field>
                  );
                }}
              />

              {/* ===== TEXTAREA FIELD ===== */}
              <form.Field
                name="description"
                validators={{
                  onBlur: ({ value }) => {
                    if (value && value.length > 200)
                      return 'Description must be at most 200 characters';
                    return undefined;
                  },
                }}
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                      <Textarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(e.target.value);
                        }}
                        aria-invalid={isInvalid}
                        placeholder="What is this workspace for?"
                        rows={3}
                        className="resize-none"
                      />
                      <FieldDescription>Optional description for your workspace.</FieldDescription>
                      {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                    </Field>
                  );
                }}
              />

              <FieldSeparator />

              {/* ===== SELECT FIELD ===== */}
              <form.Field
                name="defaultRole"
                validators={{
                  onBlur: ({ value }) => {
                    if (!value) return 'Please select a default role';
                    return undefined;
                  },
                }}
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Default Role</FieldLabel>
                      <Select
                        name={field.name}
                        value={field.state.value}
                        onValueChange={(value: string | null) => {
                          if (value) {
                            field.handleChange(value);
                          }
                        }}
                      >
                        <SelectTrigger
                          id={field.name}
                          aria-invalid={isInvalid}
                          onBlur={field.handleBlur}
                        >
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        New members will have this role by default.
                      </FieldDescription>
                      {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                    </Field>
                  );
                }}
              />

              <FieldSeparator />

              {/* ===== CHECKBOX GROUP ===== */}
              <form.Field
                name="notifications"
                validators={{
                  onBlur: ({ value }) => {
                    if (value.length === 0) return 'Select at least one notification channel';
                    return undefined;
                  },
                }}
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <FieldSet>
                      <FieldLegend variant="label">Notifications</FieldLegend>
                      <FieldDescription>
                        Choose how you want to be notified about workspace activity.
                      </FieldDescription>
                      <FieldGroup data-slot="checkbox-group">
                        {notificationOptions.map((option) => (
                          <Field
                            key={option.value}
                            orientation="horizontal"
                            data-invalid={isInvalid}
                          >
                            <Checkbox
                              id={`notification-${option.value}`}
                              name={field.name}
                              aria-invalid={isInvalid}
                              checked={field.state.value.includes(option.value)}
                              onCheckedChange={(checked) => {
                                const current = field.state.value;
                                if (checked) {
                                  field.handleChange([...current, option.value]);
                                } else {
                                  field.handleChange(current.filter((v) => v !== option.value));
                                }
                              }}
                            />
                            <FieldLabel
                              htmlFor={`notification-${option.value}`}
                              className="font-normal"
                            >
                              {option.label}
                            </FieldLabel>
                          </Field>
                        ))}
                      </FieldGroup>
                      {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                    </FieldSet>
                  );
                }}
              />

              <FieldSeparator />

              {/* ===== RADIO GROUP ===== */}
              <form.Field
                name="visibility"
                validators={{
                  onBlur: ({ value }) => {
                    if (!value) return 'Please select visibility';
                    return undefined;
                  },
                }}
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <FieldSet>
                      <FieldLegend variant="label">Visibility</FieldLegend>
                      <FieldDescription>Control who can see this workspace.</FieldDescription>
                      <RadioGroup
                        name={field.name}
                        value={field.state.value}
                        onValueChange={(value: string) => {
                          field.handleChange(value);
                        }}
                      >
                        {visibilityOptions.map((option) => (
                          <Field
                            key={option.value}
                            orientation="horizontal"
                            data-invalid={isInvalid}
                          >
                            <RadioGroupItem
                              value={option.value}
                              id={`visibility-${option.value}`}
                              aria-invalid={isInvalid}
                            />
                            <FieldContent>
                              <FieldLabel
                                htmlFor={`visibility-${option.value}`}
                                className="font-normal"
                              >
                                {option.label}
                              </FieldLabel>
                              <FieldDescription>{option.description}</FieldDescription>
                            </FieldContent>
                          </Field>
                        ))}
                      </RadioGroup>
                      {isInvalid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                    </FieldSet>
                  );
                }}
              />

              <FieldSeparator />

              {/* ===== SWITCH FIELD (horizontal layout) ===== */}
              <form.Field
                name="autoArchive"
                children={(field) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor={field.name}>Auto-archive</FieldLabel>
                      <FieldDescription>
                        Automatically archive inactive items after the retention period.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked) => {
                        field.handleChange(checked);
                      }}
                    />
                  </Field>
                )}
              />

              {/* ===== SLIDER FIELD ===== */}
              <form.Field
                name="retentionDays"
                children={(field) => (
                  <Field>
                    <FieldLabel>Retention Period</FieldLabel>
                    <FieldDescription>
                      Keep items for{' '}
                      <span className="font-medium tabular-nums">{field.state.value[0]}</span> days
                      before archiving.
                    </FieldDescription>
                    <Slider
                      value={field.state.value}
                      onValueChange={(value: number | readonly number[]) => {
                        const next = typeof value === 'number' ? [value] : [...value];
                        field.handleChange(next);
                      }}
                      min={7}
                      max={365}
                      step={1}
                      className="mt-2"
                      aria-label="Retention days"
                    />
                  </Field>
                )}
              />

              <FieldSeparator />

              {/* ===== FORM ACTIONS ===== */}
              <Field orientation="horizontal">
                <Button type="submit" form="workspace-settings-form">
                  Save Changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    form.reset();
                  }}
                >
                  Reset
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
