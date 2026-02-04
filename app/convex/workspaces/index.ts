import './triggers';

import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../../shared/errors';
import { upsertWorkspaceBillingState } from '../billing/helpers';
import { mutation, query } from '../functions';
import { getAuthenticatedUser } from '../users/helpers';
import {
  assertNotLastOwnerOfWorkspace,
  getWorkspaceMembership,
  requireWorkspaceAdminOrOwner,
} from './utils';

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
      return workspace ? [{ id: workspace._id, name: workspace.name, role: membership.role }] : [];
    });
  },
});

/**
 * Creates a new workspace and adds the authenticated user as an owner.
 *
 * @param name - The name of the workspace to create.
 * @returns The ID of the newly created workspace.
 * @throws Error if not authenticated or if name is empty.
 */
export const createWorkspace = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (!args.name.trim()) {
      throwAppErrorForConvex(ErrorCode.WORKSPACE_NAME_EMPTY);
    }

    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name.trim(),
      createdByUserId: user._id,
      creatorDisplayNameSnapshot:
        [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      creatorDisplayEmailSnapshot: user.email,
      updatedAt: Date.now(),
    });

    await ctx.db.insert('workspaceMembers', {
      userId: user._id,
      workspaceId,
      role: 'owner',
      updatedAt: Date.now(),
    });

    await upsertWorkspaceBillingState(ctx, workspaceId);

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
  },
});

/**
 * Deletes a workspace and all its members and invites.
 * Only workspace owners can delete a workspace.
 *
 * @param workspaceId - The ID of the workspace to delete.
 * @throws Error if not authenticated, not an owner, or workspace not found.
 */
export const deleteWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const { membership } = await getWorkspaceMembership(ctx, args.workspaceId);

    if (membership.role !== 'owner') {
      throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
        workspaceId: args.workspaceId as string,
        requiredRole: 'owner',
        action: 'delete',
      });
    }

    await ctx.db.delete('workspaces', args.workspaceId);
  },
});
