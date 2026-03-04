import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../functions';
import { logger } from '../logging';

export const WORKSPACE_PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type ActiveWorkspace = Exclude<Doc<'workspaces'>, { status: 'deleted' }>;

/**
 * Returns true when the workspace is in a deleted tombstone state.
 */
export const isDeletedWorkspace = (workspace: Doc<'workspaces'>) => workspace.status === 'deleted';

/**
 * Returns true when the workspace is currently active.
 */
export const isActiveWorkspace = (workspace: Doc<'workspaces'>): workspace is ActiveWorkspace =>
  !isDeletedWorkspace(workspace);

/**
 * Loads a workspace and returns null when the workspace is missing or deleted.
 */
export async function getActiveWorkspaceById(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
): Promise<ActiveWorkspace | null> {
  const workspace = await ctx.db.get('workspaces', workspaceId);
  if (!workspace || !isActiveWorkspace(workspace)) {
    return null;
  }
  return workspace;
}

/**
 * Tombstones a workspace and immediately removes memberships, invites, and contacts.
 *
 * This keeps access checks simple while retaining the workspace document for
 * retention and delayed purge.
 */
export async function tombstoneWorkspace(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  deletedByUserId: Id<'users'>,
): Promise<void> {
  const workspace = await ctx.db.get('workspaces', workspaceId);

  if (!workspace || isDeletedWorkspace(workspace)) {
    return;
  }

  const now = Date.now();
  await ctx.db.patch('workspaces', workspaceId, {
    status: 'deleted',
    deletedAt: now,
    purgeAt: now + WORKSPACE_PURGE_DELAY_MS,
    deletedByUserId,
    updatedAt: now,
  });

  const members = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .collect();

  for (const member of members) {
    await ctx.db.delete('workspaceMembers', member._id);
  }

  const invites = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .collect();

  for (const invite of invites) {
    await ctx.db.delete('workspaceInvites', invite._id);
  }

  const contacts = await ctx.db
    .query('contacts')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .collect();

  for (const contact of contacts) {
    await ctx.db.delete('contacts', contact._id);
  }

  const files = await ctx.db
    .query('workspaceFiles')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .collect();

  for (const file of files) {
    await ctx.db.delete('workspaceFiles', file._id);
  }

  logger.info({
    event: 'workspace.tombstoned',
    category: 'WORKSPACE',
    context: {
      workspaceId,
      deletedByUserId,
      removedMemberCount: members.length,
      removedInviteCount: invites.length,
      removedContactCount: contacts.length,
      removedFileCount: files.length,
    },
  });
}
