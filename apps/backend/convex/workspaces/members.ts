import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { throwAppErrorForConvex } from '../errors';
import { mutation, query } from '../functions';
import { logger } from '../logging';
import { resolveUserProfilePictureUrl } from '../users/helpers';
import { getWorkspaceMembership, requireWorkspaceAdminOrOwner } from './utils';

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
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get('users', membership.userId);
        if (user?.status !== 'active') {
          return null;
        }

        return {
          _id: user._id,
          profilePictureUrl: await resolveUserProfilePictureUrl(user),
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

    logger.info({
      event: 'workspace.member_removed',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        actorUserId: callerUser._id,
        targetUserId: args.userId,
        actorRole: callerRole,
        targetRole,
      },
    });
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
    const previousRole = targetMembership.role;

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

    logger.info({
      event: 'workspace.member_role_updated',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        actorUserId: callerUser._id,
        targetUserId: args.userId,
        previousRole,
        nextRole: args.role,
      },
    });
  },
});
