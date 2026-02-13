import { ErrorCode } from '../../shared/errors';
import type { Doc, Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';
import type { MutationCtx, QueryCtx } from '../functions';
import { getActiveUserById, getAuthenticatedUser } from '../users/helpers';
import { getActiveWorkspaceById } from './helpers';

export interface WorkspaceMembership {
  membership: Doc<'workspaceMembers'>;
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
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
) {
  const user = await getAuthenticatedUser(ctx);

  const workspace = await getActiveWorkspaceById(ctx, workspaceId);
  if (!workspace) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
      workspaceId: workspaceId as string,
    });
  }

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
 * Asserts that a workspace has more than one owner.
 * @param ctx - The Convex query or mutation context
 * @param workspaceId - The ID of the workspace to check
 * @throws Throws `WORKSPACE_LAST_OWNER` error if the workspace has only one owner
 */
export async function assertNotLastOwnerOfWorkspace(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
): Promise<void> {
  const ownerMemberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .filter((q) => q.eq(q.field('role'), 'owner'))
    .collect();

  const activeOwners = await Promise.all(
    ownerMemberships.map((m) => getActiveUserById(ctx, m.userId)),
  );
  const activeOwnerCount = activeOwners.filter((u) => u !== null).length;

  if (activeOwnerCount === 1) {
    throwAppErrorForConvex(ErrorCode.WORKSPACE_LAST_OWNER, {
      workspaceId: workspaceId as string,
    });
  }
}

/**
 * Retrieves the names of all workspaces where the specified user is the sole owner.
 * @param ctx - The Convex query or mutation context
 * @param userId - The ID of the user to check for sole ownership
 * @returns Workspace documents where the user is the only active owner
 */
export async function getSoleOwnerWorkspaceForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
) {
  const userOwnerMemberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .filter((q) => q.eq(q.field('role'), 'owner'))
    .collect();

  const soleOwnerWorkspaces: Doc<'workspaces'>[] = [];
  for (const membership of userOwnerMemberships) {
    const workspaceOwnerMemberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', membership.workspaceId))
      .filter((q) => q.eq(q.field('role'), 'owner'))
      .collect();

    const activeOwners = await Promise.all(
      workspaceOwnerMemberships.map((m) => getActiveUserById(ctx, m.userId)),
    );
    const activeOwnerCount = activeOwners.filter((u) => u !== null).length;

    if (activeOwnerCount === 1) {
      const workspace = await getActiveWorkspaceById(ctx, membership.workspaceId);
      if (workspace) {
        soleOwnerWorkspaces.push(workspace);
      }
    }
  }

  return soleOwnerWorkspaces;
}
