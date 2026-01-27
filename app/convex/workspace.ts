import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query, type QueryCtx, triggers } from './functions';
import { getAuthenticatedUser } from './user';

export interface WorkspaceMembership {
  membership: Doc<'workspaceMembers'>;
  user: Doc<'users'>;
}

/**
 * Gets the authenticated user's membership in a workspace.
 * Use this to verify workspace access and get the user's role.
 *
 * @param ctx - The query or mutation context.
 * @param workspaceId - The ID of the workspace to check access for.
 * @returns The membership document (includes role) and user document.
 * @throws WORKSPACE_ACCESS_DENIED if the user is not a member of the workspace.
 */
export async function getWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
): Promise<WorkspaceMembership> {
  const user = await getAuthenticatedUser(ctx);

  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_userId', (q) =>
      q.eq('workspaceId', workspaceId).eq('userId', user._id),
    )
    .unique();

  if (!membership) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
      workspaceId: workspaceId as string,
    });
  }

  return { membership, user };
}

/**
 * Ensures the authenticated user is an admin or owner in the workspace.
 *
 * @param ctx - The query or mutation context.
 * @param workspaceId - The ID of the workspace to check access for.
 * @param action - The action being performed for error context.
 * @returns The membership and user documents.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if caller is a regular member.
 */
export async function requireWorkspaceAdminOrOwner(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  action: string,
): Promise<WorkspaceMembership> {
  const { membership, user } = await getWorkspaceMembership(ctx, workspaceId);

  if (membership.role === 'member') {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
      workspaceId: workspaceId as string,
      requiredRole: 'admin',
      action,
    });
  }

  return { membership, user };
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
      updatedAt: Date.now(),
    });

    await ctx.db.insert('workspaceMembers', {
      userId: user._id,
      workspaceId,
      role: 'owner',
      status: 'active',
      updatedAt: Date.now(),
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
      const owners = await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
        .filter((q) => q.eq(q.field('role'), 'owner'))
        .collect();

      if (owners.length === 1) {
        throwAppErrorForConvex(ErrorCode.WORKSPACE_LAST_OWNER, {
          workspaceId: args.workspaceId as string,
        });
      }
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

triggers.register('workspaces', async (ctx, change) => {
  if (change.operation !== 'delete') {
    return;
  }

  const members = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', change.id))
    .collect();

  for (const member of members) {
    await ctx.db.delete('workspaceMembers', member._id);
  }

  const invites = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', change.id))
    .collect();

  for (const invite of invites) {
    await ctx.db.delete('workspaceInvites', invite._id);
  }
});
