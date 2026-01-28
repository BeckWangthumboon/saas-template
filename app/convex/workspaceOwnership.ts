import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './functions';

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
  const owners = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .filter((q) => q.eq(q.field('role'), 'owner'))
    .collect();

  if (owners.length === 1) {
    throwAppErrorForConvex(ErrorCode.WORKSPACE_LAST_OWNER, {
      workspaceId: workspaceId as string,
    });
  }
}

/**
 * Retrieves the names of all workspaces where the specified user is the sole owner.
 * @param ctx - The Convex query or mutation context
 * @param userId - The ID of the user to check for sole ownership
 * @returns An array of workspace names where the user is the only owner
 */
export async function getSoleOwnerWorkspaceNamesForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<string[]> {
  const ownerMemberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .filter((q) => q.eq(q.field('role'), 'owner'))
    .collect();

  const soleOwnerWorkspaceNames: string[] = [];
  for (const membership of ownerMemberships) {
    const workspaceOwners = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', membership.workspaceId))
      .filter((q) => q.eq(q.field('role'), 'owner'))
      .collect();

    if (workspaceOwners.length === 1) {
      const workspace = await ctx.db.get('workspaces', membership.workspaceId);
      if (workspace) {
        soleOwnerWorkspaceNames.push(workspace.name);
      }
    }
  }

  return soleOwnerWorkspaceNames;
}
