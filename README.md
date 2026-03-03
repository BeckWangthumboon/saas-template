# SaaS Template (Convex + React + WorkOS + Polar)

This app is a multi-tenant SaaS template with:

- WorkOS authentication
- Convex backend (queries, mutations, actions, HTTP routes, cron jobs)
- Workspace-based tenancy with role-based access control
- Polar billing + subscription webhooks
- Internal entitlement model (plan/features/limits) with both backend and UI gating

This template is intentionally opinionated. The goal is to give you a reliable starting point with clear backend rules, consistent deletion behavior, and predictable feature-gating patterns.

## Tech stack

- Frontend: React 19, Vite, TanStack Router, TanStack Form, Tailwind CSS v4, shadcn/ui
- Backend: Convex (DB + server functions + HTTP + cron)
- Auth: WorkOS + `@convex-dev/workos-authkit`
- Billing: Polar (`@polar-sh/sdk`)

## Project layout

```txt
.
├── package.json          # workspace-level lint/typecheck/format scripts
└── app/
    ├── convex/           # backend schema, server functions, webhooks, cron jobs
    ├── shared/           # cross-runtime shared types/utilities (errors)
    ├── src/              # frontend app
    └── package.json      # frontend/dev scripts
```

## Local setup

1. Install dependencies (workspace root):

```bash
bun install
```

2. Configure environment variables.

Frontend (`app/.env.local`):

- `VITE_CONVEX_URL`
- `VITE_WORKOS_CLIENT_ID`
- `VITE_WORKOS_REDIRECT_URI`

Backend (Convex runtime environment):

- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRO_MONTHLY_PRODUCT_ID`
- `POLAR_PRO_YEARLY_PRODUCT_ID`
- `POLAR_SERVER` (`sandbox` or `production`, defaults to `sandbox`)
- `APP_ENV` (`dev` or `prod`, defaults to `dev`)
- `APP_ORIGIN` (required, used for billing return URLs)
- `CONVEX_LOG_LEVEL` (`debug` | `info` | `warn` | `error`, defaults to `info`)
- `RESEND_API_KEY` (required for invites)
- `RESEND_WEBHOOK_SECRET` (required for webhook verification)
- `RESEND_FROM_EMAIL` (required for invites, e.g. `Acme <invites@acme.com>`)

3. Start local development (from `app/`):

```bash
bun run dev
```

Useful commands:

```bash
bun run check      # lint + typecheck + format
bun run generate   # regenerate Convex schema/api types
```

## Seed and reset local dev data

Dev data tooling lives in `convex/dev/index.ts` and is hard-blocked unless `APP_ENV=dev`.

Commands (from `app/`):

```bash
bun run dev:seed-data     # Create/update deterministic demo workspaces/users/billing state
bun run dev:reset-data    # Clear workspace + billing + invite data (preserves users)
bun run dev:reseed-data   # Reset then seed in one command
```

Notes:

- `dev:reset-data` requires an explicit confirmation token in the script (`RESET_DEV_DATA`).
- `dev:reset-data` preserves users by default because auth is provider-backed.
- For a full wipe, include users explicitly:

```bash
bunx convex run dev/index.js:resetDevData '{"confirm":"RESET_DEV_DATA","includeUsers":true}'
```

- Never run these with `--prod`. Even if attempted, functions are blocked unless `APP_ENV=dev`.

## Architecture and key decisions

### 1) Tenant model and access control

- Tenancy unit is a `workspace`.
- Membership is explicit in `workspaceMembers` with roles: `owner`, `admin`, `member`.
- Access checks are centralized in backend helpers:
  - `getWorkspaceMembership(...)` for membership requirement
  - `requireWorkspaceAdminOrOwner(...)` for elevated role requirement

Why this choice: it prevents UI-only authorization mistakes and keeps sensitive checks server-side.

### 2) User lifecycle and deletion strategy

User deletion uses tombstones (not immediate hard delete):

Deletion flow:

1. `deleteAccount` validates ownership/billing constraints.
2. Memberships and pending invites are cleaned up.
3. WorkOS delete is enqueued via Workpool.
4. User transitions to `deleting` with retry metadata.
5. Completion handler marks user `deleted` and removes PII.
6. Daily cron purges deleted user tombstones after retention.

Why this choice: deletion stays reliable, retryable, and auditable without blocking request/response paths.

### 3) Workspace lifecycle and deletion strategy

Workspace deletion uses tombstones (not immediate hard delete):

- `status = 'deleted'`
- `deletedAt`, `purgeAt`, `deletedByUserId`
- memberships, invites, and contacts are removed immediately at tombstone time
- daily cron purges workspace tombstones after retention

Deletion is blocked if workspace billing is still billable (`trialing`/`active`/`past_due`).

Why this choice: it matches the user lifecycle approach and gives safer operational behavior.

### 4) Billing model (Polar)

- `workspaceBillingState` is the source of truth for a workspace's billing state.
- Polar webhook endpoint: `POST /billing/polar/events`.
- All user billing changes are made through Polar's portal. It is synced with the app via webhooks.
- Webhook handling is idempotent using `billingEvents.providerEventId`.
- Out-of-order webhook updates are ignored using `providerSubscriptionUpdatedAt`.
- Plan mapping is internalized through product IDs:
  - `free` (no Polar product)
  - `pro_monthly`
  - `pro_yearly`

Why this choice: provider events are normalized first, so feature checks always run against internal state.

### 5) Entitlement model (the feature primitive)

Entitlements are derived from billing state + usage:

- plan key (`free` / `pro_monthly` / `pro_yearly`)
- features (`team_members`)
- limits (`members`, `invites`)
- lifecycle (`status`, `isLocked`, grace period)

Important behavior:

- `past_due` has a grace period.
- during grace, effective lifecycle stays usable.
- after grace, workspace is locked for gated flows.

Why this choice: feature logic should not depend directly on raw billing provider status. Everything goes through entitlements.

### 6) Invite model and decisions

Invites are designed to be safe, idempotent, and easy to reason about:

- Only `owner` and `admin` can create/revoke invites.
- Admins can invite `member` only (not `admin`).
- Inviting yourself is blocked.
- Invite links expire after 7 days.
- If there is already an active pending invite for the same workspace + email, the invite is refreshed (resend behavior) instead of creating a duplicate active invite.
- Historical invite rows are preserved for audit/history (accepted/revoked/expired invites are not hard-deleted as part of normal flow).
- Acceptance is validated server-side for token state, expiry, email/account match, membership status, and active workspace state.
- Invite creation/acceptance is also gated by entitlements (`team_members`, member limits, and workspace lock state).
- Invite creation is blocked for suppressed email addresses (bounce or spam complaint).

Why this choice: invite logic needs to be strict on the backend so links cannot bypass role, billing, or identity rules.

### 7) Invite email webhooks and suppression

- Resend webhook endpoint: `POST /emails/resend/events`.
- Bounce (`email.bounced`) and spam complaint (`email.complained`) events create/update suppression rows.
- Suppressed emails are prevented from receiving future invite emails.
- Resend component data is cleaned daily via cron (`cleanupOldEmails`, `cleanupAbandonedEmails`).

### 8) Error model

Errors are standardized with shared codes and categories in `shared/errors.ts`.

- Backend throws structured `ConvexError` payloads via `throwAppErrorForConvex(...)`.
- Frontend parses with `parseAppError(...)`.
- Mutation/action hooks return `Result<T, AppErrorData>` (`neverthrow`) to keep UI handling explicit.

Why this choice: you get consistent backend/frontend behavior and safer user-facing messaging.

### 9) Route boundaries

- Public auth routes: sign-in/callback.
- App routes: wrapped in `UserProvider` and protected.
- Invite routes: authenticated and validated against invite token + signed-in user.

Why this choice: access stays protected even when users know the URL.

### 10) Logging strategy and runbook

- Backend logs are centralized through `convex/logging.ts` via `logger.debug/info/warn/error`.
- All backend logs are emitted as JSON strings to `console.*`, so they appear in Convex deployment logs.
- Log level is controlled by `CONVEX_LOG_LEVEL`.

Where to look:

1. Open Convex Dashboard -> Deployment -> Logs.
2. Filter by `event` name (example: `billing.webhook.handled`, `auth.user.delete_requested`).
3. If debugging a user-facing exception, copy the Convex request ID (`[Request ID: ...]`) and search by request ID in Logs.

Notes:

- Convex dashboard logs are a realtime/short-history view.
- For long-term retention and bulk export, configure Convex log streams.

## Starter packs

### Contacts starter pack (included)

This template includes a minimal Contacts CRUD example you can keep or delete per project.

- Route: `/workspaces/$workspaceId/contacts`
- Backend: `convex/contacts/index.ts`
- Table: `contacts` in `convex/schema.ts`
- UI page: `src/routes/_app/workspaces/$workspaceId/contacts.tsx`

What it demonstrates:

- TanStack Form validation (`name` required, optional valid email)
- Convex CRUD flow (`listContacts`, `createContact`, `updateContact`, `deleteContact`)
- Workspace membership checks in backend handlers
- Data cleanup when a workspace is tombstoned or purged

If you do not need this starter pack in a new project, remove the route file, backend module, schema table, and navigation links.
