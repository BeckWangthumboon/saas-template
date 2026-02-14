import './triggers';

import { v } from 'convex/values';

import { ErrorCode } from '../../shared/errors';
import { upsertWorkspaceBillingState } from '../billing/helpers';
import { isBillableLifecycleStatus } from '../entitlements/service';
import { throwAppErrorForConvex } from '../errors';
import { mutation, type MutationCtx, query } from '../functions';
import { logger } from '../logging';
import { rateLimiter } from '../rateLimiter';
import { getAuthenticatedUser } from '../users/helpers';
import { isActiveWorkspace, tombstoneWorkspace } from './helpers';
import {
  assertNotLastOwnerOfWorkspace,
  getWorkspaceMembership,
  requireWorkspaceAdminOrOwner,
} from './utils';

const DEFAULT_SOLO_WORKSPACE_NAME = 'My Workspace';

/**
 * Creates a workspace owned by the provided user and initializes billing state.
 */
async function createWorkspaceWithOwner(
  ctx: MutationCtx,
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>,
  name: string,
) {
  const now = Date.now();
  const trimmedName = name.trim();
  const workspaceId = await ctx.db.insert('workspaces', {
    name: trimmedName,
    createdByUserId: user._id,
    creatorDisplayNameSnapshot:
      [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
    creatorDisplayEmailSnapshot: user.email,
    status: 'active',
    updatedAt: now,
  });

  await ctx.db.insert('workspaceMembers', {
    userId: user._id,
    workspaceId,
    role: 'owner',
    updatedAt: now,
  });

  await upsertWorkspaceBillingState(ctx, workspaceId);

  logger.info({
    event: 'workspace.created',
    category: 'WORKSPACE',
    context: {
      workspaceId,
      ownerUserId: user._id,
    },
  });

  return workspaceId;
}

/**
 * Gets all workspaces the authenticated user is a member of.
 *
 * @returns Array of workspaces with the user's role in each workspace.
 */
export const getUserWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    const workspaces = await Promise.all(
      memberships.map((m) => ctx.db.get('workspaces', m.workspaceId)),
    );

    return memberships.flatMap((membership, i) => {
      const workspace = workspaces[i];
      return workspace && isActiveWorkspace(workspace)
        ? [{ id: workspace._id, name: workspace.name, role: membership.role }]
        : [];
    });
  },
});

/**
 * Creates a new workspace and adds the authenticated user as an owner.
 *
 * @param name - The name of the workspace to create.
 * @returns The ID of the newly created workspace.
 * @throws WORKSPACE_NAME_EMPTY when the provided name is blank.
 * @throws WORKSPACE_CREATE_RATE_LIMITED when the user exceeds workspace creation limits.
 */
export const createWorkspace = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (!args.name.trim()) {
      throwAppErrorForConvex(ErrorCode.WORKSPACE_NAME_EMPTY);
    }

    const status = await rateLimiter.limit(ctx, 'createWorkspaceByUser', {
      key: user._id,
    });
    if (!status.ok) {
      logger.warn({
        event: 'workspace.create_rate_limited',
        category: 'WORKSPACE',
        context: {
          userId: user._id,
          retryAfter: status.retryAfter,
        },
      });

      return throwAppErrorForConvex(ErrorCode.WORKSPACE_CREATE_RATE_LIMITED, {
        retryAfter: status.retryAfter,
      });
    }

    return createWorkspaceWithOwner(ctx, user, args.name);
  },
});

/**
 * Ensures the authenticated user has at least one workspace.
 * Creates a default free workspace when the user has none.
 *
 * @returns The existing or newly created workspace ID.
 */
export const ensureDefaultWorkspaceForCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const existingMembership = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    if (existingMembership.length > 0) {
      const workspaces = await Promise.all(
        existingMembership.map((membership) => ctx.db.get('workspaces', membership.workspaceId)),
      );

      const activeMembership = existingMembership.find((_, index) => {
        const workspace = workspaces[index];
        return workspace !== null && isActiveWorkspace(workspace);
      });

      if (activeMembership) {
        logger.debug({
          event: 'workspace.default_ensured_existing',
          category: 'WORKSPACE',
          context: {
            workspaceId: activeMembership.workspaceId,
            userId: user._id,
          },
        });

        return activeMembership.workspaceId;
      }
    }

    const workspaceId = await createWorkspaceWithOwner(ctx, user, DEFAULT_SOLO_WORKSPACE_NAME);

    logger.info({
      event: 'workspace.default_created',
      category: 'WORKSPACE',
      context: {
        workspaceId,
        userId: user._id,
      },
    });

    return workspaceId;
  },
});

/**
 * Updates a workspace's name.
 * Only owners and admins can update the workspace name.
 *
 * @param workspaceId - The ID of the workspace to update.
 * @param name - The new workspace name.
 * @throws Error if not authenticated, not a member, or insufficient role.
 */
export const updateWorkspaceName = mutation({
  args: { workspaceId: v.id('workspaces'), name: v.string() },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminOrOwner(ctx, args.workspaceId, 'update_name');

    if (!args.name.trim()) {
      throwAppErrorForConvex(ErrorCode.WORKSPACE_NAME_EMPTY);
    }

    await ctx.db.patch('workspaces', args.workspaceId, {
      name: args.name.trim(),
      updatedAt: Date.now(),
    });

    logger.info({
      event: 'workspace.name_updated',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
      },
    });
  },
});

/**
 * Removes the authenticated user from a workspace.
 * If the user is an owner, they can only leave if there owners >= 1
 *
 * @param workspaceId - The ID of the workspace to leave.
 * @throws Error if not authenticated, not a member, or is the only owner.
 */
export const leaveWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const { membership } = await getWorkspaceMembership(ctx, args.workspaceId);

    if (membership.role === 'owner') {
      await assertNotLastOwnerOfWorkspace(ctx, args.workspaceId);
    }

    await ctx.db.delete('workspaceMembers', membership._id);

    logger.info({
      event: 'workspace.member_left',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        userId: membership.userId,
        role: membership.role,
      },
    });
  },
});

/**
 * Tombstones a workspace and removes its members and invites.
 * Only workspace owners can delete a workspace.
 * Billable workspaces must be canceled first via billing portal.
 *
 * @param workspaceId - The ID of the workspace to delete.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if caller is not an owner.
 * @throws BILLING_WORKSPACE_STATE_MISSING if workspace billing state is missing.
 * @throws BILLING_WORKSPACE_DELETE_BLOCKED if workspace is still billable.
 */
export const deleteWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const { membership, user } = await getWorkspaceMembership(ctx, args.workspaceId);

    if (membership.role !== 'owner') {
      throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
        workspaceId: args.workspaceId as string,
        requiredRole: 'owner',
        action: 'delete',
      });
    }

    const billingState = await ctx.db
      .query('workspaceBillingState')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
      .unique();

    if (!billingState) {
      return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_STATE_MISSING, {
        workspaceId: args.workspaceId,
      });
    }

    if (isBillableLifecycleStatus(billingState.status)) {
      logger.warn({
        event: 'workspace.delete_blocked_billable_status',
        category: 'WORKSPACE',
        context: {
          workspaceId: args.workspaceId,
          status: billingState.status,
        },
      });

      return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_DELETE_BLOCKED, {
        workspaceId: args.workspaceId,
        status: billingState.status,
      });
    }

    await tombstoneWorkspace(ctx, args.workspaceId, user._id);

    logger.info({
      event: 'workspace.deleted',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        deletedByUserId: user._id,
      },
    });
  },
});
