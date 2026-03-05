import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../functions';

export interface CreatePendingUploadArgs {
  key: string;
  kind: string;
  requestedByUserId: Id<'users'>;
  workspaceId?: Id<'workspaces'>;
  expiresAt: number;
}

export const createPendingUpload = async (ctx: MutationCtx, args: CreatePendingUploadArgs) => {
  await ctx.db.insert('uploads', {
    key: args.key,
    kind: args.kind,
    requestedByUserId: args.requestedByUserId,
    workspaceId: args.workspaceId,
    expiresAt: args.expiresAt,
  });
};

export const getPendingUploadByKey = async (ctx: QueryCtx | MutationCtx, key: string) => {
  return ctx.db
    .query('uploads')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
};

export const deletePendingUpload = async (ctx: MutationCtx, uploadId: Id<'uploads'>) => {
  await ctx.db.delete('uploads', uploadId);
};

export const listExpiredPendingUploadsByKind = async (
  ctx: QueryCtx | MutationCtx,
  kind: string,
  now: number,
  limit: number,
) => {
  return ctx.db
    .query('uploads')
    .withIndex('by_kind_expiresAt', (q) => q.eq('kind', kind).lt('expiresAt', now))
    .take(limit);
};
