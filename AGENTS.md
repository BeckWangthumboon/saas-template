# AI Agent Guidelines

This repo is a Convex + React (Vite) SaaS template.

## Commands

- `bun run check`: run lint + typecheck + format
- `bun run generate`: regenerate Convex types/schema

Do not run `bun run dev` or `bun run build`. Assume dev server is already running. If not, alert user. 

## Core Standards

- Keep TypeScript strict and prefer inference over unnecessary explicit annotations.
- Use inline type imports (`import { type X } from '...'`).
- Follow existing formatting/lint rules (Prettier + ESLint are source of truth).
- Use `@/*` path aliases for app imports.
- Use functional React components with typed props.
- Keep context providers state-focused; render UI outside providers.

## Error Handling

- Backend: use shared structured errors from `@saas/shared/errors` and map external failures to internal error codes.
- Frontend: handle mutation/action results via existing hooks (`useConvexMutation`, `useConvexAction`); queries rely on error boundaries.

## UI + Forms

- Prefer `@/components/ui` primitives and `cn()` for class composition.
- Use TanStack Form patterns already in the codebase.

## Naming

- Components: `PascalCase`
- Functions/variables/files: `camelCase` (unless route conventions require otherwise)
- Constants: `UPPER_SNAKE_CASE`

## Project Shape (High-Level)

- `apps/web/convex`: backend functions + schema
- `apps/web/src`: frontend app (routes, components, hooks, lib)
- `packages/*`: shared workspace packages

## Before Commit

1. Run `bun run check`.
2. Manually verify the changed flow in the app.
