import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
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
import {
  assertAvatarContentType,
  assertAvatarFileSize,
  buildAvatarObjectKey,
  isAvatarObjectKeyForUser,
  sanitizeAvatarFileName,
} from './avatarHelpers';
import { getAuthenticatedUser } from './helpers';

const AVATAR_UPLOAD_KIND = 'avatar';
const AVATAR_UPLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutes
const AVATAR_UPLOAD_CLEANUP_BATCH_SIZE = 100;

const throwAvatarUploadNotFound = (key: string) =>
  throwAppErrorForConvex(ErrorCode.AVATAR_UPLOAD_NOT_FOUND, { key });

export const requestAvatarUploadUrl = mutation({
  args: {
    fileName: v.string(),
    size: v.number(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const sanitizedFileName = sanitizeAvatarFileName(args.fileName);
    if (!sanitizedFileName) {
      return throwAppErrorForConvex(ErrorCode.AVATAR_INVALID_FILE_TYPE, {
        contentType: args.contentType,
      });
    }

    assertAvatarFileSize(args.size);
    assertAvatarContentType(args.contentType);

    const rateLimitStatus = await rateLimiter.limit(ctx, 'requestAvatarUploadUrlByUser', {
      key: user._id,
    });
    if (!rateLimitStatus.ok) {
      logger.warn({
        event: 'auth.avatar.upload_url_rate_limited',
        category: 'AUTH',
        context: {
          userId: user._id,
          retryAfter: rateLimitStatus.retryAfter,
        },
      });

      return throwAppErrorForConvex(ErrorCode.AVATAR_UPLOAD_RATE_LIMITED, {
        retryAfter: rateLimitStatus.retryAfter,
      });
    }

    const key = buildAvatarObjectKey(user._id, sanitizedFileName);
    const { url } = await generateR2UploadUrlForKey(key);
    const now = Date.now();

    await createPendingUpload(ctx, {
      key,
      kind: AVATAR_UPLOAD_KIND,
      requestedByUserId: user._id,
      expiresAt: now + AVATAR_UPLOAD_TTL_MS,
    });

    return {
      key,
      url,
      fileName: sanitizedFileName,
    };
  },
});

export const finalizeAvatarPendingUpload = internalMutation({
  args: {
    key: v.string(),
    metadataFound: v.boolean(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (!isAvatarObjectKeyForUser(args.key, user._id)) {
      return throwAvatarUploadNotFound(args.key);
    }

    const pendingUpload = await getPendingUploadByKey(ctx, args.key);

    if (!pendingUpload) {
      if (user.avatarSource === 'custom' && user.avatarKey === args.key) {
        return { key: args.key };
      }
      return throwAvatarUploadNotFound(args.key);
    }

    if (pendingUpload.kind !== AVATAR_UPLOAD_KIND || pendingUpload.requestedByUserId !== user._id) {
      return throwAvatarUploadNotFound(args.key);
    }

    const cleanupFailedUpload = async (reason: string) => {
      await deleteR2ObjectOrDefer(ctx, {
        key: args.key,
        source: 'auth.avatar.cleanup_failed',
        reason,
      });

      await deletePendingUpload(ctx, pendingUpload._id);
    };

    if (!args.metadataFound) {
      await cleanupFailedUpload('metadata_missing');
      return throwAvatarUploadNotFound(args.key);
    }

    try {
      assertAvatarFileSize(args.size);
      assertAvatarContentType(args.contentType);
    } catch (error: unknown) {
      await cleanupFailedUpload('validation_failed');
      throw error;
    }

    const previousCustomAvatarKey = user.avatarSource === 'custom' ? user.avatarKey : undefined;
    const now = Date.now();

    await ctx.db.patch('users', user._id, {
      avatarSource: 'custom',
      avatarKey: args.key,
      profilePictureUrl: undefined,
      updatedAt: now,
    });

    await deletePendingUpload(ctx, pendingUpload._id);

    if (previousCustomAvatarKey && previousCustomAvatarKey !== args.key) {
      await deleteR2ObjectOrDefer(ctx, {
        key: previousCustomAvatarKey,
        source: 'auth.avatar.previous_cleanup_failed',
        reason: 'replaced_by_new_avatar',
      });
    }

    logger.info({
      event: 'auth.avatar.upload_finalized',
      category: 'AUTH',
      context: {
        userId: user._id,
        key: args.key,
        contentType: args.contentType,
        size: args.size,
      },
    });

    return { key: args.key };
  },
});

export const finalizeAvatarUpload = action({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args): Promise<{ key: string }> => {
    await syncR2Metadata(ctx, args.key);
    const metadata = await getR2Metadata(ctx, args.key);

    const result: { key: string } = await ctx.runMutation(
      internal.users.avatar.finalizeAvatarPendingUpload,
      {
        key: args.key,
        metadataFound: !!metadata,
        contentType: metadata?.contentType,
        size: metadata?.size,
      },
    );

    return result;
  },
});

export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const previousCustomAvatarKey = user.avatarSource === 'custom' ? user.avatarKey : undefined;

    const now = Date.now();
    await ctx.db.patch('users', user._id, {
      avatarSource: 'workos',
      avatarKey: undefined,
      profilePictureUrl: user.workosProfilePictureUrl ?? undefined,
      updatedAt: now,
    });

    if (previousCustomAvatarKey) {
      await deleteR2ObjectOrDefer(ctx, {
        key: previousCustomAvatarKey,
        source: 'auth.avatar.remove_cleanup_failed',
        reason: 'avatar_removed',
      });
    }

    logger.info({
      event: 'auth.avatar.removed',
      category: 'AUTH',
      context: {
        userId: user._id,
      },
    });
  },
});

export const cleanupExpiredAvatarUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredUploads = await listExpiredPendingUploadsByKind(
      ctx,
      AVATAR_UPLOAD_KIND,
      now,
      AVATAR_UPLOAD_CLEANUP_BATCH_SIZE,
    );

    for (const upload of expiredUploads) {
      await deleteR2ObjectOrDefer(ctx, {
        key: upload.key,
        source: 'auth.avatar.expired_upload_cleanup_failed',
        reason: 'expired_pending_upload',
      });

      await deletePendingUpload(ctx, upload._id);
    }

    if (expiredUploads.length > 0) {
      logger.info({
        event: 'auth.avatar.expired_uploads_cleaned',
        category: 'AUTH',
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
