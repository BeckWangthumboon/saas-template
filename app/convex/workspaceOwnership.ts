import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './functions';
import { getActiveUserById } from './user';

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
 * @returns An array of workspace names where the user is the only owner
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
      const workspace = await ctx.db.get('workspaces', membership.workspaceId);
      if (workspace) {
        soleOwnerWorkspaces.push(workspace);
      }
    }
  }

  return soleOwnerWorkspaces;
}
