import { ErrorCode } from '@saas/shared/errors';

import type { Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';

export const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const AVATAR_FILE_NAME_SAFE_PATTERN = /[^A-Za-z0-9._-]/g;

const AVATAR_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const sanitizeAvatarFileName = (fileName: string) => {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\s+/g, '_').replace(AVATAR_FILE_NAME_SAFE_PATTERN, '_').slice(0, 120);
};

export const buildAvatarObjectKey = (userId: Id<'users'>, sanitizedFileName: string) => {
  return `users/${userId}/avatar/${crypto.randomUUID()}-${sanitizedFileName}`;
};

export const isAvatarObjectKeyForUser = (key: string, userId: Id<'users'>) => {
  return key.startsWith(`users/${userId}/avatar/`);
};

export const assertAvatarFileSize = (size: number | undefined) => {
  if (typeof size !== 'number' || size <= 0 || size > AVATAR_MAX_SIZE_BYTES) {
    return throwAppErrorForConvex(ErrorCode.AVATAR_FILE_TOO_LARGE, {
      maxSizeBytes: AVATAR_MAX_SIZE_BYTES,
      actualSizeBytes: size,
    });
  }
};

export const assertAvatarContentType = (contentType: string | undefined) => {
  if (!contentType || !AVATAR_ALLOWED_CONTENT_TYPES.has(contentType)) {
    return throwAppErrorForConvex(ErrorCode.AVATAR_INVALID_FILE_TYPE, {
      contentType,
    });
  }
};
