# Invariants

## Billing

- `workspaceBillingState` is the app's source of truth for billing state.
- Provider webhook payloads should be normalized into internal billing state before feature checks use them.
- Out-of-order subscription updates must not overwrite newer state.

## Entitlements

- Feature gating should depend on internal entitlements, not raw Polar subscription status.
- `past_due` workspaces can remain usable during grace and become locked only after grace expires.

## Deletion

- User deletion is tombstone-first, not hard delete first.
- Workspace deletion is tombstone-first, not hard delete first.
- Deletion flows are allowed to enqueue external cleanup or retry work instead of doing everything inline.

## Invites

- Only owners and admins can manage invites.
- Admins can invite `member` but not `admin`.
- Re-inviting the same workspace/email should refresh the pending invite instead of creating duplicates.
- Invite acceptance must remain validated against token state, expiry, signed-in user email, membership state, and workspace state.

## Storage

- Avatar uploads use R2 object storage with pending-upload tracking.
- Failed object deletions should be retried through `r2DeleteQueue`, not silently dropped.

## Access Control

- Workspace authorization must remain enforced in backend helpers and handlers, not only in the UI.
