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
- `APP_ORIGIN` (required, used for billing return URLs)

3. Start local development (from `app/`):

```bash
bun run dev
```

Useful commands:

```bash
bun run check      # lint + typecheck + format
bun run generate   # regenerate Convex schema/api types
```

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
- memberships and invites are removed immediately at tombstone time
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

Why this choice: invite logic needs to be strict on the backend so links cannot bypass role, billing, or identity rules.

### 7) Error model

Errors are standardized with shared codes and categories in `shared/errors.ts`.

- Backend throws structured `ConvexError` payloads via `throwAppErrorForConvex(...)`.
- Frontend parses with `parseAppError(...)`.
- Mutation/action hooks return `Result<T, AppErrorData>` (`neverthrow`) to keep UI handling explicit.

Why this choice: you get consistent backend/frontend behavior and safer user-facing messaging.

### 8) Route boundaries

- Public auth routes: sign-in/callback.
- App routes: wrapped in `UserProvider` and protected.
- Invite routes: authenticated and validated against invite token + signed-in user.

Why this choice: access stays protected even when users know the URL.

## Known gaps and TODOs

- TODO: centralize backend env validation into a single startup/validation module (current checks are partially distributed).
- TODO: add structured logging strategy + explicit "where to look" runbook.
- TODO: add seed/demo data workflow for local dev.
- TODO: add reset-dev-environment workflow/documentation.
- TODO: add optional starter-pack examples for file upload/external API and email notifications.
- TODO (uncertain): confirm preferred local backend env workflow for team onboarding (Convex dashboard vs scripted env setup).
- TODO (uncertain): confirm whether current `predev` behavior (opening Convex dashboard) should remain default for this template.
