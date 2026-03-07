import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { assertWorkspaceUnlockedForWrites } from '../entitlements/service';
import { throwAppErrorForConvex } from '../errors';
import { action, internalMutation, mutation } from '../functions';
import { logger } from '../logging';
import { rateLimiter } from '../rateLimiter';
import { deleteR2ObjectOrDefer } from '../storage/deletes';
import { generateR2UploadUrlForKey, getR2Metadata, syncR2Metadata } from '../storage/r2Client';
import {
  createPendingUpload,
  deletePendingUpload,
  getPendingUploadByKey,
  listExpiredPendingUploadsByKind,
} from '../storage/uploads';
import { getWorkspaceMembership } from '../workspaces/utils';
import {
  assertWorkspaceFileSize,
  buildWorkspaceFileObjectKey,
  isWorkspaceObjectKeyForWorkspace,
  sanitizeWorkspaceFileName,
} from './helpers';

const WORKSPACE_FILE_UPLOAD_KIND = 'workspace_file';
const WORKSPACE_FILE_UPLOAD_TTL_MS = 3600 * 1000; // 3600 seconds (1 hour)
const WORKSPACE_FILE_UPLOAD_CLEANUP_BATCH_SIZE = 100;

const throwWorkspaceFileUploadNotFound = (workspaceId: Id<'workspaces'>, key: string) =>
  throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_UPLOAD_NOT_FOUND, {
    key,
    workspaceId: workspaceId as string,
  });

/**
 * Generates a signed upload URL for workspace file uploads.
 * Creates a pending row in the generic uploads table for cleanup/finalization.
 */
export const requestWorkspaceFileUploadUrl = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    fileName: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await getWorkspaceMembership(ctx, args.workspaceId);
    await assertWorkspaceUnlockedForWrites(ctx, args.workspaceId);

    const sanitizedFileName = sanitizeWorkspaceFileName(args.fileName);
    if (!sanitizedFileName) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_NAME_EMPTY);
    }
    assertWorkspaceFileSize(args.size);

    const rateLimitStatus = await rateLimiter.limit(ctx, 'requestWorkspaceUploadUrlByActor', {
      key: `${args.workspaceId}:${user._id}`,
    });
    if (!rateLimitStatus.ok) {
      logger.warn({
        event: 'workspace.file.upload_url_rate_limited',
        category: 'WORKSPACE',
        context: {
          workspaceId: args.workspaceId,
          userId: user._id,
          retryAfter: rateLimitStatus.retryAfter,
        },
      });

      return throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_UPLOAD_RATE_LIMITED, {
        workspaceId: args.workspaceId as string,
        retryAfter: rateLimitStatus.retryAfter,
      });
    }

    const key = buildWorkspaceFileObjectKey(args.workspaceId, sanitizedFileName);
    const { url } = await generateR2UploadUrlForKey(key);
    const now = Date.now();

    await createPendingUpload(ctx, {
      key,
      kind: WORKSPACE_FILE_UPLOAD_KIND,
      requestedByUserId: user._id,
      workspaceId: args.workspaceId,
      expiresAt: now + WORKSPACE_FILE_UPLOAD_TTL_MS,
    });

    return {
      key,
      url,
      fileName: sanitizedFileName,
    };
  },
});

/**
 * Internal mutation used by finalize action after R2 metadata sync/read.
 * Handles all membership/access checks, upload-row validation, and failure cleanup.
 */
export const finalizeWorkspacePendingUpload = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    key: v.string(),
    fileName: v.string(),
    metadataFound: v.boolean(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await getWorkspaceMembership(ctx, args.workspaceId);
    await assertWorkspaceUnlockedForWrites(ctx, args.workspaceId);

    if (!isWorkspaceObjectKeyForWorkspace(args.key, args.workspaceId)) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
        workspaceId: args.workspaceId as string,
      });
    }

    const sanitizedFileName = sanitizeWorkspaceFileName(args.fileName);
    if (!sanitizedFileName) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_NAME_EMPTY);
    }

    const existingFile = await ctx.db
      .query('workspaceFiles')
      .withIndex('by_workspaceId_key', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('key', args.key),
      )
      .unique();

    const pendingUpload = await getPendingUploadByKey(ctx, args.key);

    if (!pendingUpload) {
      if (existingFile) {
        return existingFile._id;
      }
      return throwWorkspaceFileUploadNotFound(args.workspaceId, args.key);
    }

    if (
      pendingUpload.kind !== WORKSPACE_FILE_UPLOAD_KIND ||
      pendingUpload.workspaceId !== args.workspaceId ||
      pendingUpload.requestedByUserId !== user._id
    ) {
      return throwWorkspaceFileUploadNotFound(args.workspaceId, args.key);
    }

    const cleanupFailedUpload = async (reason: string) => {
      await deleteR2ObjectOrDefer(ctx, {
        key: args.key,
        source: 'workspace.file.cleanup_failed',
        reason,
      });

      await deletePendingUpload(ctx, pendingUpload._id);
    };

    if (existingFile) {
      await deletePendingUpload(ctx, pendingUpload._id);
      return existingFile._id;
    }

    if (!args.metadataFound) {
      await cleanupFailedUpload('metadata_missing');
      return throwWorkspaceFileUploadNotFound(args.workspaceId, args.key);
    }

    const size = args.size ?? 0;
    try {
      assertWorkspaceFileSize(size);
    } catch (error: unknown) {
      await cleanupFailedUpload('size_invalid');
      throw error;
    }

    const now = Date.now();
    const fileId = await ctx.db.insert('workspaceFiles', {
      workspaceId: args.workspaceId,
      uploadedByUserId: pendingUpload.requestedByUserId,
      fileName: sanitizedFileName,
      contentType: args.contentType,
      size,
      key: args.key,
      updatedAt: now,
    });

    await deletePendingUpload(ctx, pendingUpload._id);

    logger.info({
      event: 'workspace.file.upload_finalized',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        fileId,
        uploadedByUserId: pendingUpload.requestedByUserId,
        size,
        contentType: args.contentType,
      },
    });

    return fileId;
  },
});

/**
 * Finalizes a workspace file upload after client PUT to signed URL.
 * Action is responsible for R2 metadata sync/read.
 * Mutation is responsible for all auth, validation, and DB state updates.
 */
export const finalizeWorkspaceFileUpload = action({
  args: {
    workspaceId: v.id('workspaces'),
    key: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await syncR2Metadata(ctx, args.key);
    const metadata = await getR2Metadata(ctx, args.key);

    const fileId: Id<'workspaceFiles'> = await ctx.runMutation(
      internal.workspaceFiles.upload.finalizeWorkspacePendingUpload,
      {
        workspaceId: args.workspaceId,
        key: args.key,
        fileName: args.fileName,
        metadataFound: !!metadata,
        contentType: metadata?.contentType,
        size: metadata?.size,
      },
    );

    return {
      fileId,
    };
  },
});

/**
 * Cleans up expired pending workspace uploads and orphaned R2 objects.
 * Intended to be invoked by cron.
 */
export const cleanupExpiredWorkspaceFileUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredUploads = await listExpiredPendingUploadsByKind(
      ctx,
      WORKSPACE_FILE_UPLOAD_KIND,
      now,
      WORKSPACE_FILE_UPLOAD_CLEANUP_BATCH_SIZE,
    );

    for (const upload of expiredUploads) {
      await deleteR2ObjectOrDefer(ctx, {
        key: upload.key,
        source: 'workspace.file.expired_upload_r2_cleanup_failed',
        reason: 'expired_pending_upload',
      });

      await deletePendingUpload(ctx, upload._id);
    }

    if (expiredUploads.length > 0) {
      logger.info({
        event: 'workspace.file.expired_uploads_cleaned',
        category: 'WORKSPACE',
        context: {
          cleanedCount: expiredUploads.length,
        },
      });
    }

    return {
      cleanedCount: expiredUploads.length,
    };
  },
});
