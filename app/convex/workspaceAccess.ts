import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './functions';
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
