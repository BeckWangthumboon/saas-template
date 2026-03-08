# Billing Notes

Autumn is the source of truth for workspace billing feature access:

- `invites` gates whether a workspace can send invites.
- `team_members` gates whether a workspace can add members.

The workspace member cap is enforced locally in the backend instead of Autumn.

Reason:

- active workspace membership is stored in Convex
- we do not synchronize member usage counts into Autumn
- the backend enforces the current `50` active member limit at acceptance time

This split is intentional: Autumn decides whether the feature is available, and Convex enforces the local capacity rule.
