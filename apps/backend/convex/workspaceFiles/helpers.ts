import { ErrorCode } from '@saas/shared/errors';

import type { Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';

export const WORKSPACE_FILE_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const fileNameSafePattern = /[^A-Za-z0-9._-]/g;

export const sanitizeWorkspaceFileName = (fileName: string) => {
  const trimmed = fileName.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\s+/g, '_').replace(fileNameSafePattern, '_').slice(0, 120);
};

export const buildWorkspaceFileObjectKey = (
  workspaceId: Id<'workspaces'>,
  sanitizedFileName: string,
) => {
  return `workspaces/${workspaceId}/files/${crypto.randomUUID()}-${sanitizedFileName}`;
};

export const isWorkspaceObjectKeyForWorkspace = (key: string, workspaceId: Id<'workspaces'>) => {
  return key.startsWith(`workspaces/${workspaceId}/files/`);
};

export const assertWorkspaceFileSize = (size: number | undefined) => {
  if (typeof size !== 'number' || size <= 0 || size > WORKSPACE_FILE_MAX_SIZE_BYTES) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_FILE_TOO_LARGE, {
      maxSizeBytes: WORKSPACE_FILE_MAX_SIZE_BYTES,
      actualSizeBytes: size,
    });
  }
};
