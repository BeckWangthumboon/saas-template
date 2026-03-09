# Remaining Autumn Migration Tasks

## Frontend UX

1. Keep the current removal of client-visible billing restriction UX.
   - Do not reintroduce limited-access, lock, or grace-state UI by default.
   - If product requirements change later, rebuild that UX from Autumn checks instead of local billing lifecycle state.

2. If billing UX is revisited later, rebuild only the UX layer with Autumn.
   - Likely starting point: `apps/web/src/routes/_app/w/$workspaceKey/route.tsx`
   - Allowed patterns:
     - limited-access banner or panel
     - disabled or hidden billing-restricted actions
     - upgrade/paywall messaging around `team_members` and `invites`
   - Non-goal: reintroducing local billing lifecycle state to drive frontend branches.

3. Keep the old Polar-style grace/lock lifecycle model removed.
   - The following backend write gates should remain ungated unless a new product requirement explicitly says otherwise:
     - contact create
     - contact update
     - contact delete
     - workspace file upload URL creation
     - workspace file upload finalization
     - workspace file delete
   - If any of these are gated again later, use Autumn-based checks instead of local lifecycle state.

## Backend Simplification

4. Remove `workspaceBillingState` from product logic, keeping Autumn as the billing source of truth.
   - Update: shared entitlements no longer depend on `workspaceBillingState`.
   - Completed:
     - `entitlements` now returns local workspace usage only
     - Members page/nav is no longer hidden by local billing-derived state
     - Billing page no longer reads plan/limits from `entitlements`
     - `getWorkspaceBillingSummary` now reads Autumn directly instead of `workspaceBillingState`
     - Billing summary/frontend status handling now uses Autumn statuses (`active`, `trialing`, `past_due`, `scheduled`, `expired`, plus app-local `none`)
     - workspace deletion blocking now reads Autumn directly with no billing-summary cache
     - account deletion blocking now reads Autumn directly with no billing-summary cache
     - workspace creation no longer creates a local billing row
     - `workspaceBillingState` helpers, schema, cleanup, and dev/demo seed/reset code were removed
   - Confirmed behavior:
     - Autumn `customers.get(...)` returns `statusCode === 404` with `error.code === customer_not_found` when no customer exists yet.
     - Treat that 404 as app-local `free` / `none`, not as an integration failure.

5. Decide whether any remaining local billing status should still drive product behavior, or whether Autumn should become the only source for access decisions.
   - Current state:
     - Autumn is now the source of truth for billing summary and destructive-action blocking.
     - No local billing status table remains in app code.
   - Open verification:
     - confirm how much of the Autumn SDK result shape is actually trustworthy/typed versus needing explicit local validation/parsing

## Audit Cleanup

6. Audit frontend error handling and UI branches that may still assume old lock/delete blocking behavior:
   - `apps/web/src/features/workspaces/InviteMemberDialog.tsx`
   - `apps/web/src/routes/_invite/invite/$token.tsx`
   - completed: updated stale delete-flow copy in `apps/web/src/features/auth/ProfilePage.tsx`
   - completed: updated stale delete-flow copy in `apps/web/src/routes/_app/w/$workspaceKey/settings/workspace.tsx`

7. Fix Billing Page checkout button is slow.

## Recommendation

- Best next step: audit frontend error handling and UI branches that may still assume old lock/delete blocking behavior.
