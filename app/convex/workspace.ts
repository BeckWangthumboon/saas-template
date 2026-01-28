import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import { mutation, query, triggers } from './functions';
import { getAuthenticatedUser } from './user';
import { getWorkspaceMembership, requireWorkspaceAdminOrOwner } from './workspaceAccess';
import { assertNotLastOwnerOfWorkspace } from './workspaceOwnership';

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

/**
 * Gets all members of a workspace.
 * Only workspace members can view the member list.
 *
 * @param workspaceId - The ID of the workspace to get members for.
 * @returns Array of workspace members with user details and role.
 * @throws WORKSPACE_ACCESS_DENIED if caller is not a member of the workspace.
 */
export const getWorkspaceMembers = query({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);

    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get('users', membership.userId);
        if (!user) {
          return null;
        }

        return {
          _id: user._id,
          profilePictureUrl: user.profilePictureUrl,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: membership.role,
          joinedAt: membership._creationTime,
        };
      }),
    );

    return members.filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

/**
 * Removes a member from a workspace.
 * Owners can remove any member (except themselves and the last owner).
 * Admins can only remove members (not other admins or owners).
 *
 * @param workspaceId - The ID of the workspace.
 * @param userId - The ID of the user to remove.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if caller is a regular member, or admin trying to remove admin/owner.
 * @throws WORKSPACE_REMOVE_SELF if trying to remove yourself (use leaveWorkspace instead).
 * @throws WORKSPACE_LAST_OWNER if trying to remove the last owner.
 */
export const removeMember = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { membership: callerMembership, user: callerUser } = await requireWorkspaceAdminOrOwner(
      ctx,
      args.workspaceId,
      'remove_member',
    );

    if (callerUser._id === args.userId) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_REMOVE_SELF);
    }

    const targetMembership = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_userId', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('userId', args.userId),
      )
      .unique();

    if (!targetMembership) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_MEMBER_NOT_FOUND, {
        userId: args.userId as string,
        workspaceId: args.workspaceId as string,
      });
    }

    const callerRole = callerMembership.role;
    const targetRole = targetMembership.role;

    switch (callerRole) {
      case 'admin':
        if (targetRole === 'admin' || targetRole === 'owner') {
          return throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
            workspaceId: args.workspaceId as string,
            requiredRole: 'owner',
            action: 'remove_admin_or_owner',
          });
        }
        break;
      case 'owner':
        if (targetRole === 'owner') {
          const owners = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
            .filter((q) => q.eq(q.field('role'), 'owner'))
            .collect();

          if (owners.length === 1) {
            return throwAppErrorForConvex(ErrorCode.WORKSPACE_LAST_OWNER, {
              workspaceId: args.workspaceId as string,
            });
          }
        }
        break;
    }

    await ctx.db.delete('workspaceMembers', targetMembership._id);
  },
});

/**
 * Updates a member's role in a workspace.
 * Only admins and owners can change member roles.
 * Admins can promote members to admin, demote themselves, but cannot demote other admins.
 * Owners can assign any role including 'owner'.
 *
 * @param workspaceId - The ID of the workspace.
 * @param userId - The ID of the user whose role to change.
 * @param role - The new role to assign.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if caller is a regular member, admin assigning owner, or admin demoting another admin.
 * @throws WORKSPACE_LAST_OWNER if trying to demote the last owner.
 */
export const updateMemberRole = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    const { membership: callerMembership, user: callerUser } = await requireWorkspaceAdminOrOwner(
      ctx,
      args.workspaceId,
      'update_role',
    );

    const targetMembership = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_userId', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('userId', args.userId),
      )
      .unique();

    if (!targetMembership) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_MEMBER_NOT_FOUND, {
        userId: args.userId as string,
        workspaceId: args.workspaceId as string,
      });
    }

    const callerRole = callerMembership.role;
    const targetRole = targetMembership.role;
    const isSelf = callerUser._id === args.userId;

    switch (callerRole) {
      case 'admin':
        if (args.role === 'owner') {
          return throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
            workspaceId: args.workspaceId as string,
            requiredRole: 'owner',
            action: 'promote_to_owner',
          });
        }
        if (targetRole === 'owner') {
          return throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
            workspaceId: args.workspaceId as string,
            requiredRole: 'owner',
            action: 'modify_owner',
          });
        }
        if (targetRole === 'admin' && !isSelf) {
          return throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
            workspaceId: args.workspaceId as string,
            requiredRole: 'owner',
            action: 'demote_admin',
          });
        }
        break;
      case 'owner':
        if (targetRole === 'owner' && args.role !== 'owner') {
          const owners = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
            .filter((q) => q.eq(q.field('role'), 'owner'))
            .collect();

          if (owners.length === 1) {
            return throwAppErrorForConvex(ErrorCode.WORKSPACE_LAST_OWNER, {
              workspaceId: args.workspaceId,
            });
          }
        }
        break;
    }

    await ctx.db.patch('workspaceMembers', targetMembership._id, {
      role: args.role,
      updatedAt: Date.now(),
    });
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
