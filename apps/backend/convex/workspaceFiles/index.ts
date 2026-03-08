import './triggers';

import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import { throwAppErrorForConvex } from '../errors';
import { action, internalQuery, mutation, query } from '../functions';
import { logger } from '../logging';
import { getR2SignedUrl } from '../storage/r2Client';
import { getWorkspaceMembership } from '../workspaces/utils';

/**
 * Lists files stored for a workspace.
 * Requires workspace membership.
 */
export const listWorkspaceFiles = query({
  args: {
    workspaceId: v.id('workspaces'),
  },
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);

    const files = await ctx.db
      .query('workspaceFiles')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
      .order('desc')
      .collect();

    return files.map((file) => ({
      fileId: file._id,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
      updatedAt: file.updatedAt,
      createdAt: file._creationTime,
      uploadedByUserId: file.uploadedByUserId,
    }));
  },
});

/**
 * Loads a file for generating a signed download URL.
 */
export const getWorkspaceFileForDownload = internalQuery({
  args: {
    workspaceId: v.id('workspaces'),
    fileId: v.id('workspaceFiles'),
  },
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);

    const file = await ctx.db.get('workspaceFiles', args.fileId);
    if (file?.workspaceId !== args.workspaceId) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_NOT_FOUND, {
        fileId: args.fileId as string,
        workspaceId: args.workspaceId as string,
      });
    }

    return {
      key: file.key,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
    };
  },
});

/**
 * Creates a signed private download URL for a workspace file.
 * Requires workspace membership.
 */
export const getWorkspaceFile = action({
  args: {
    workspaceId: v.id('workspaces'),
    fileId: v.id('workspaceFiles'),
    expiresInSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const file: {
      key: string;
      fileName: string;
      contentType: string | undefined;
      size: number;
    } = await ctx.runQuery(internal.workspaceFiles.index.getWorkspaceFileForDownload, {
      workspaceId: args.workspaceId,
      fileId: args.fileId,
    });

    const expiresInSeconds = args.expiresInSeconds ?? 900;
    const url = await getR2SignedUrl(file.key, expiresInSeconds);

    return {
      fileId: args.fileId,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
      expiresInSeconds,
      url,
    };
  },
});

/**
 * Deletes a workspace file record.
 * Actual R2 object cleanup is handled by table trigger.
 */
export const deleteWorkspaceFile = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    fileId: v.id('workspaceFiles'),
  },
  handler: async (ctx, args) => {
    const { user } = await getWorkspaceMembership(ctx, args.workspaceId);

    const file = await ctx.db.get('workspaceFiles', args.fileId);
    if (file?.workspaceId !== args.workspaceId) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_NOT_FOUND, {
        fileId: args.fileId as string,
        workspaceId: args.workspaceId as string,
      });
    }

    await ctx.db.delete('workspaceFiles', file._id);

    logger.info({
      event: 'workspace.file.deleted',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        fileId: args.fileId,
        deletedByUserId: user._id,
        key: file.key,
      },
    });
  },
});
