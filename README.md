# SaaS Template 

## TLDR

An opiniated SaaS starter with auth, workspace/orgs, billing, emails, etc. Perfect for your next project without rebuilding the boring SaaS infrastructure!

## What's Inside

- **WorkOS authentication** - SSO, SAML, magic links
- **Convex backend** - Queries, mutations, actions, HTTP routes, cron jobs
- **Workspace-based tenancy** - Role-based access control (owner, admin, member)
- **Polar billing** - Subscription webhooks, plan management
- **Resend emails** - Transactional invites, bounce handling, suppression
- **Entitlement model** - Plan/features/limits with backend + UI gating
- **Cloudflare R2 storage** - Workspace file upload/download with presigned URLs and deletion reconciliation
- **User avatar uploads** - Profile picture management backed by R2 with WorkOS fallback
- **Onboarding flow** - Welcome dialog for first-time users

This template is intentionally opinionated. The goal is to give you a reliable starting point with clear backend rules, consistent deletion behavior, and predictable feature-gating patterns.

---

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Configure environment variables (see below)
# 3. Start development
bun run dev
```

## Tech Stack

**Frontend**

- React 19, Vite, TanStack Router, TanStack Form
- Tailwind CSS v4, shadcn/ui components
- `next-themes` for dark/light theme management
- `@base-ui/react` for headless UI primitives
**Backend**

- Convex (DB + server functions + HTTP routes + cron jobs)

**Integrations**

- Auth: WorkOS + `@convex-dev/workos-authkit`
- Billing: Polar (`@polar-sh/sdk`)
- Email: Resend (transactional emails + invite flows)
- File Storage: Cloudflare R2 

## Project layout

```txt
.
├── package.json          # workspace-level scripts
├── apps/
│   ├── web/              # frontend workspace
│   └── backend/          # Convex backend workspace
│       └── convex/
└── packages/
    ├── shared/           # cross-runtime shared types/utilities (errors)
    └── convex-api/       # re-exported Convex generated API/types for frontend
```

## Local Setup

### 1. Install dependencies (workspace root)

```bash
bun install
```

### 2. Configure environment variables

**Frontend** (`apps/web/.env.local`):

- `VITE_CONVEX_URL`
- `VITE_WORKOS_CLIENT_ID`
- `VITE_WORKOS_REDIRECT_URI`

**Backend** (`apps/backend/.env.local` or Convex runtime environment):

- `CONVEX_DEPLOYMENT`
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_PRO_MONTHLY_PRODUCT_ID`
- `POLAR_PRO_YEARLY_PRODUCT_ID`
- `POLAR_SERVER` (`sandbox` or `production`, defaults to `sandbox`)
- `APP_ENV` (`dev` or `prod`, defaults to `dev`)
- `APP_ORIGIN` (required, used for billing return URLs)
- `CONVEX_LOG_LEVEL` (`debug` | `info` | `warn` | `error`, defaults to `info`)

**Resend** (for invite emails and webhooks):

- `RESEND_API_KEY` (required for sending invites)
- `RESEND_WEBHOOK_SECRET` (required for webhook verification)
- `RESEND_FROM_EMAIL` (required, e.g. `Acme <invites@acme.com>`)

**Cloudflare R2** (for file storage and avatar uploads):

- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

### 3. Start local development (from workspace root)

```bash
bun run dev
```

### Useful commands

```bash
bun run check      # lint + typecheck + format
bun run generate   # regenerate Convex schema/api types
```

## Seed & Reset Local Dev Data

Dev data tooling lives in `apps/backend/convex/dev/index.ts` and is hard-blocked unless `APP_ENV=dev`.

### Commands (from workspace root)

```bash
bun run dev:seed-data     # Create/update deterministic demo workspaces/users/billing state
bun run dev:reset-data    # Clear workspace + billing + invite data (preserves users)
bun run dev:reseed-data   # Reset then seed in one command
```

### Notes

- `dev:reset-data` requires an explicit confirmation token in the script (`RESET_DEV_DATA`).
- `dev:reset-data` preserves users by default because auth is provider-backed.
- For a full wipe, include users explicitly:

```bash
bunx convex run dev/index.js:resetDevData '{"confirm":"RESET_DEV_DATA","includeUsers":true}'
```

- Never run these with `--prod`. Even if attempted, functions are blocked unless `APP_ENV=dev`.

## Architecture & Key Decisions

### 1. Tenant Model & Access Control

- Tenancy unit is a `workspace`.
- Membership is explicit in `workspaceMembers` with roles: `owner`, `admin`, `member`.
- Access checks are centralized in backend helpers:
  - `getWorkspaceMembership(...)` for membership requirement
  - `requireWorkspaceAdminOrOwner(...)` for elevated role requirement

Why this choice: it prevents UI-only authorization mistakes and keeps sensitive checks server-side.

### 2. User Lifecycle & Deletion Strategy

User deletion uses tombstones (not immediate hard delete):

Deletion flow:

1. `deleteAccount` validates ownership/billing constraints.
2. Memberships and pending invites are cleaned up.
3. WorkOS delete is enqueued via Workpool.
4. User transitions to `deleting` with retry metadata.
5. Completion handler marks user `deleted` and removes PII.
6. Daily cron purges deleted user tombstones after retention.

Why this choice: deletion stays reliable, retryable, and auditable without blocking request/response paths.

### 3. Workspace Lifecycle & Deletion Strategy

Workspace deletion uses tombstones (not immediate hard delete):

- `status = 'deleted'`
- `deletedAt`, `purgeAt`, `deletedByUserId`
- memberships, invites, and contacts are removed immediately at tombstone time
- daily cron purges workspace tombstones after retention

Deletion is blocked if workspace billing is still billable (`trialing`/`active`/`past_due`).

Why this choice: it matches the user lifecycle approach and gives safer operational behavior.

### 4. Billing Model (Polar + Autumn)

- `workspaceBillingState` is the source of truth for a workspace's billing state.
- Checkout and billing portal flows still use Polar.
- Feature access checks are moving to Autumn.
- Plan mapping is internalized through product IDs:
  - `free` (no Polar product)
  - `pro_monthly`
  - `pro_yearly`

Why this choice: provider-specific billing flows stay isolated while app-level access checks move toward Autumn.

### 5. Entitlement Model (Feature Primitive)

Entitlements are derived from billing state + usage:

- plan key (`free` / `pro_monthly` / `pro_yearly`)
- features (`team_members`)
- limits (`members`, `invites`)

Why this choice: app features should be expressed in app terms instead of leaking provider-specific behavior through the codebase.

### 6. Invite Model & Decisions

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

### 7. Email & Invite Webhooks (Resend)

Transactional emails are handled via Resend with proper webhook validation:

- Resend webhook endpoint: `POST /emails/resend/events`.
- Bounce (`email.bounced`) and spam complaint (`email.complained`) events create/update suppression rows.
- Suppressed emails are automatically prevented from receiving future invite emails.
- Invite email sending is wrapped in entitlement checks and workspace lock validation.
- Resend component data is cleaned daily via cron (`cleanupOldEmails`, `cleanupAbandonedEmails`).

Why this choice: Resend provides reliable transactional email delivery with built-in bounce/complaint handling, ensuring invite flows remain safe and spam-free.

### 8. Error Model

Errors are standardized with shared codes and categories in `shared/errors.ts`.

- Backend throws structured `ConvexError` payloads via `throwAppErrorForConvex(...)`.
- Frontend parses with `parseAppError(...)`.
- Mutation/action hooks return `Result<T, AppErrorData>` (`neverthrow`) to keep UI handling explicit.

Why this choice: you get consistent backend/frontend behavior and safer user-facing messaging.

### 9. Route Boundaries

- Public auth routes: sign-in/callback.
- App routes: wrapped in `UserProvider` and protected.
- Invite routes: authenticated and validated against invite token + signed-in user.

Why this choice: access stays protected even when users know the URL.

### 10. Logging Strategy & Runbook

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

### 11. File Storage (Cloudflare R2)

- `workspaceFiles` is the source of truth for stored files.
- Files are stored in R2 with presigned upload and download URLs.
- Upload records are tracked with expiration; incomplete uploads are cleaned up via cron.
- Failed R2 deletions are queued in `r2DeleteQueue` for reconciliation.
- See section 13 for the related cron schedule.

Why this choice: R2 provides cost-effective object storage without egress fees. Presigned URLs keep credentials server-side while giving the client direct upload/download access.

### 12. Rate Limiting

Distributed rate limiting is applied via `@convex-dev/rate-limiter` to protect write paths:

- `createWorkspaceByUser` — workspace creation
- `createInviteByUser` — invite creation
- `acceptInviteByUser` — invite acceptance
- `mutateContactsByActor` — contact mutations

Why this choice: Convex mutations run on a shared runtime, so server-side rate limits prevent abuse without requiring a separate infrastructure layer.

### 13. Cron Jobs

The following scheduled jobs run automatically. Operators should be aware of what runs and when:

| Job | Schedule (UTC) |
|-----|----------------|
| Reconcile stuck user deletions | Daily 2:30 AM |
| Purge deleted user tombstones | Daily 3:00 AM |
| Purge deleted workspace tombstones | Daily 3:30 AM |
| Cleanup Resend email component data | Daily 4:00 AM |
| Cleanup expired workspace file uploads | Daily 4:00 AM |
| Cleanup expired avatar uploads | Daily 4:30 AM |
| Reconcile failed R2 deletes | Daily 5:00 AM |

## Starter Packs

### Contacts Starter Pack (Included)

This template includes a minimal Contacts CRUD example you can keep or delete per project.

- Route: `/w/$workspaceKey/contacts`
- Backend: `convex/contacts/index.ts`
- Table: `contacts` in `convex/schema.ts`
- UI page: `src/routes/_app/w/$workspaceKey/contacts.tsx`

What it demonstrates:

- TanStack Form validation (`name` required, optional valid email)
- Convex CRUD flow (`listContacts`, `createContact`, `updateContact`, `deleteContact`)
- Workspace membership checks in backend handlers
- Data cleanup when a workspace is tombstoned or purged

If you do not need this starter pack in a new project, remove the route file, backend module, schema table, and navigation links.

### Files Starter Pack (Included)

This template includes a workspace file manager example you can keep or delete per project.

- Route: `/w/$workspaceKey/files`
- Backend: `convex/workspaceFiles/index.ts`
- Table: `workspaceFiles` in `convex/schema.ts`
- UI page: `src/routes/_app/w/$workspaceKey/files.tsx`

What it demonstrates:

- Drag-and-drop file upload (max 50MB) with presigned R2 URLs
- Signed download URLs with File System Access API save picker
- Per-workspace file listing and deletion
- R2 cleanup on workspace tombstone/purge

If you do not need this starter pack in a new project, remove the route file, backend module, schema table, and navigation links.
