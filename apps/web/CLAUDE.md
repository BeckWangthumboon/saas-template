# AI Agent Guidelines for SaaS Template

This file provides instructions for AI agents working on this Convex + React (Vite) SaaS template.

## Build & Development Commands

```bash
# Code quality
bun run lint         # ESLint with auto-fix and caching
bun run typecheck    # TypeScript type checking
bun run format       # Prettier formatting
bun run check        # Run lint, typecheck, and format
bun run generate     # Generate Convex schema and API
```

- Do not run bun run dev. Assume that the dev server is already running.
- Do not run bun run build either.

## Code Style Guidelines

### Formatting

- **Prettier**: Semi-colons, single quotes, trailing commas, 100 char width, 2-space tabs
- **Import sorting**: Automatic via `simple-import-sort` plugin
- **TypeScript strict mode**: Enabled

### Imports

```typescript
// Type imports - use inline type imports
import { type ComponentProps } from 'react';
import { type QueryCtx, type MutationCtx } from './_generated/server';

// Organized imports (sorted automatically)
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

### Component Patterns

Functional components with typed props. Route files export `Route = createFileRoute('/path')` with `component`.

### React Context Providers

Separate UI and state concerns: providers should only manage state, not render UI (loading states, dialogs, etc.). Handle UI separately via composition.

### Naming Conventions

- **Components**: PascalCase (`UserProfile.tsx`)
- **Files**: camelCase (`userProfile.tsx`, `user.ts`)
- **Functions/Variables**: camelCase (`getUserById`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)

### Error Handling

Backend uses structured errors from `shared/errors.ts`:

```typescript
import { ErrorCode, throwAppErrorForConvex } from '@saas/shared/errors';

// Backend: Always use throwAppErrorForConvex with error codes
if (!identity) {
  return throwAppErrorForConvex(ErrorCode.AUTH_UNAUTHORIZED, { reason: 'no_identity' });
}
if (!user) {
  return throwAppErrorForConvex(ErrorCode.AUTH_USER_NOT_FOUND, { authId: identity.subject });
}
if (!args.name.trim()) {
  throwAppErrorForConvex(ErrorCode.WORKSPACE_NAME_EMPTY);
}

// External API errors: Map to internal error codes
try {
  return await workos.userManagement.getUser(authId);
} catch (error) {
  const workosError = error as { status?: number; message?: string };
  if (workosError.status === 404) {
    return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_USER_NOT_FOUND, { authId });
  }
  return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
    operation: 'getUser',
    status: workosError.status,
    message: workosError.message,
  });
}
```

See `convex/user.ts`, `convex/workspace.ts`, and `convex/auth.ts` for backend examples.

Frontend uses custom hooks with `neverthrow` Result pattern:

```typescript
import { useConvexMutation, useConvexAction } from '@/hooks';
import { toast } from 'sonner';

function MyComponent() {
  const { mutate: updateName } = useConvexMutation(api.user.updateName);
  const { execute: deleteAccount, state: deleteState } = useConvexAction(api.user.deleteAccount);

  // Handle mutation results with toasts
  const handleSubmit = async () => {
    const result = await updateName({ firstName: value });

    if (result.isOk()) {
      toast.success('Profile updated', { description: 'Your name has been updated successfully.' });
    } else {
      toast.error('Failed to update profile', { description: result.error.message });
    }
  };

  // Access loading state
  if (deleteState.status === 'loading') {
    return <Spinner />;
  }
}
```

See `src/hooks/useConvexMutation.ts`, `src/hooks/useConvexAction.ts`, and `src/routes/_app/settings.tsx` for frontend examples.

Queries don't use Result pattern - errors caught by React Error Boundaries (see `src/hooks/useConvexQuery.ts`).

### Form Handling (TanStack Form)

Use TanStack Form for form management. Field validation with `validators: { onBlur }`.

### TypeScript Rules

- **No unused vars**: Prefix with `_` to ignore (`const _unused = 1`)
- **Consistent type imports**: Always use inline type syntax
- **Prefer inference**: Derive types from Convex validators/data model (`Infer`, `Doc`, validator objects) when possible
- **Avoid explicit return types**: Let TypeScript infer return types for local/internal functions unless an explicit type is needed for public API boundaries, narrowing, or readability
- **Template expressions**: Numbers and booleans allowed (no need for explicit casting)
- **React event handlers**: No void return checks needed

### JSDoc Policy

- Add JSDoc to all exported functions and all non-trivial internal functions.
- Include `@param` entries for parameters, `@returns` for return type, and `@throws` when applicable.
- For complex functions, include a one-line summary followed by a more detailed description.

### Path Aliases

```typescript
// Use @/* for src imports
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { env } from '@/env';
```

### UI Components

- Use shadcn/ui components from `@/components/ui`
- Use `cn()` utility for conditional class merging
- Use `tailwind-merge` with `clsx` for combining Tailwind classes

### Testing

No test framework is currently configured.

## Project Structure

```
app/
├── convex/           # Convex backend (schema, queries, mutations, actions)
├── src/
│   ├── components/   # React components
│   │   └── ui/       # shadcn/ui components
│   ├── lib/          # Utilities (cn, helpers)
│   └── routes/       # TanStack Router files
└── package.json      # Frontend dependencies
```

## Before Committing

1. Run `bun run check` - automatically runs lint, typecheck, and format
2. Test changes manually in the app

## Notes

- This is a React 19 + Vite + Convex + Tailwind stack
- TanStack Router for file-based routing
- TanStack Form for form management
- WorkOS for authentication
- Shadcn/ui for UI components
- next-themes for dark/light mode
