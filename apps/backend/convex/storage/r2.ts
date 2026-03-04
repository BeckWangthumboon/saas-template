import { R2 } from '@convex-dev/r2';
import { ErrorCode } from '@saas/shared/errors';

import { components } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { convexEnv, type R2Config } from '../env';
import { throwAppErrorForConvex } from '../errors';
import type { MutationCtx } from '../functions';
import { logger } from '../logging';

export const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const WORKSPACE_FILE_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const getR2Config = (): R2Config => convexEnv.r2;

const primaryR2 = new R2(components.r2, getR2Config());

export const getR2 = () => primaryR2;

const fileNameSafePattern = /[^A-Za-z0-9._-]/g;

export const sanitizeFileName = (fileName: string) => {
  const trimmed = fileName.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\s+/g, '_').replace(fileNameSafePattern, '_').slice(0, 120);
};

export const buildAvatarObjectKey = (userId: Id<'users'>) => {
  return `avatars/${userId}/${crypto.randomUUID()}`;
};

export const buildWorkspaceFileObjectKey = (
  workspaceId: Id<'workspaces'>,
  sanitizedFileName: string,
) => {
  return `workspaces/${workspaceId}/${crypto.randomUUID()}-${sanitizedFileName}`;
};

export const isAvatarObjectKeyForUser = (key: string, userId: Id<'users'>) => {
  return key.startsWith(`avatars/${userId}/`);
};

export const isWorkspaceObjectKeyForWorkspace = (key: string, workspaceId: Id<'workspaces'>) => {
  return key.startsWith(`workspaces/${workspaceId}/`);
};

export const assertAvatarContentType = (contentType: string | undefined) => {
  if (typeof contentType !== 'string' || !contentType.startsWith('image/')) {
    return throwAppErrorForConvex(ErrorCode.AVATAR_INVALID_FILE_TYPE, {
      contentType,
    });
  }
};

export const assertAvatarSize = (size: number | undefined) => {
  if (typeof size !== 'number' || size <= 0 || size > AVATAR_MAX_SIZE_BYTES) {
    return throwAppErrorForConvex(ErrorCode.AVATAR_FILE_TOO_LARGE, {
      maxSizeBytes: AVATAR_MAX_SIZE_BYTES,
      actualSizeBytes: size,
    });
  }
};

export const assertWorkspaceFileSize = (size: number | undefined) => {
  if (typeof size !== 'number' || size <= 0 || size > WORKSPACE_FILE_MAX_SIZE_BYTES) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_TOO_LARGE, {
      maxSizeBytes: WORKSPACE_FILE_MAX_SIZE_BYTES,
      actualSizeBytes: size,
    });
  }
};

export const throwR2OperationError = (operation: string, error: unknown): never => {
  logger.error({
    event: 'storage.r2.operation_failed',
    category: 'INTERNAL',
    context: {
      operation,
    },
    error,
  });

  return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
    details: `R2 ${operation} failed`,
  });
};

export async function scheduleDeleteR2Object(ctx: MutationCtx, key: string, _reason: string) {
  const config = getR2Config();

  await ctx.scheduler.runAfter(0, components.r2.lib.deleteObject, {
    key,
    ...config,
  });
}
