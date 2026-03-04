import { R2 } from '@convex-dev/r2';
import { ErrorCode } from '@saas/shared/errors';

import { components } from '../_generated/api';
import { convexEnv, type R2Config } from '../env';
import { throwAppErrorForConvex } from '../errors';
import type { ActionCtx, MutationCtx, QueryCtx } from '../functions';
import { logger } from '../logging';

const getR2Config = (): R2Config => convexEnv.r2;

const r2 = new R2(components.r2, getR2Config());

const throwR2OperationError = (operation: string, error: unknown): never => {
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

export const generateR2UploadUrlForKey = async (key: string) => {
  return r2
    .generateUploadUrl(key)
    .catch((error: unknown) => throwR2OperationError('generateUploadUrl', error));
};

export const syncR2Metadata = async (ctx: ActionCtx, key: string): Promise<void> => {
  await r2
    .syncMetadata(ctx, key)
    .catch((error: unknown) => throwR2OperationError('syncMetadata', error));
};

export const getR2Metadata = async (ctx: ActionCtx | QueryCtx, key: string) => {
  return r2
    .getMetadata(ctx, key)
    .catch((error: unknown) => throwR2OperationError('getMetadata', error));
};

export const getR2SignedUrl = async (key: string, expiresIn: number) => {
  return r2
    .getUrl(key, { expiresIn })
    .catch((error: unknown) => throwR2OperationError('getUrl', error));
};

export const deleteR2Object = async (ctx: MutationCtx, key: string): Promise<void> => {
  await r2
    .deleteObject(ctx, key)
    .catch((error: unknown) => throwR2OperationError('deleteObject', error));
};
