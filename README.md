# SaaS Template

Convex + React SaaS starter with workspace tenancy, auth, billing, invites, email, and avatar uploads.

For the AI Demand Share product contract, start with [notes/spec.md](/home/beckthemaster/Documents/code/projects/ai-seo/notes/spec.md).

See [docs/invariants.md](/home/beckthemaster/Documents/code/projects/ai-seo/docs/invariants.md) for the small set of non-obvious backend rules worth preserving.

## Prereqs

- Bun
- A Convex deployment
- WorkOS credentials
- Polar credentials
- Resend credentials
- Cloudflare R2 credentials

## Setup

1. Install dependencies:

```bash
bun install
```

2. Configure env files:

- Frontend: `apps/web/.env.local`
- Backend: `apps/backend/.env.local`

Frontend vars:

- `VITE_CONVEX_URL`
- `VITE_WORKOS_CLIENT_ID`
- `VITE_WORKOS_REDIRECT_URI`

Backend vars:

- `CONVEX_DEPLOYMENT`
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRO_MONTHLY_PRODUCT_ID`
- `POLAR_PRO_YEARLY_PRODUCT_ID`
- `POLAR_SERVER`
- `APP_ENV`
- `APP_ORIGIN`
- `CONVEX_LOG_LEVEL`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `RESEND_FROM_EMAIL`
- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

3. Regenerate Convex artifacts when schema or function signatures change:

```bash
bun run generate
```

## Commands

```bash
bun run check         # lint + typecheck + format
bun run test:backend  # backend tests
bun run generate      # regenerate Convex schema/api types
```

Dev data helpers:

```bash
bun run dev:seed-data
bun run dev:reset-data
bun run dev:reseed-data
```

`dev:reset-data` is blocked unless `APP_ENV=dev`. It preserves users by default.

## Project Layout

```txt
apps/web        frontend app
apps/backend    Convex backend
packages/shared shared errors/utilities
packages/convex-api generated Convex API re-export
```
