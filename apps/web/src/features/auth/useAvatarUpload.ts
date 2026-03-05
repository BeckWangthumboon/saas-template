import { api } from '@saas/convex-api';
import { type AppErrorData, ErrorCategory, ErrorCode } from '@saas/shared/errors';
import type { FunctionReturnType } from 'convex/server';
import { err, type Result } from 'neverthrow';
import { useCallback } from 'react';

import { type ActionState, type MutationState, useConvexAction, useConvexMutation } from '@/hooks';

type FinalizeAvatarUploadRef = typeof api.users.avatar.finalizeAvatarUpload;
type RemoveAvatarRef = typeof api.users.avatar.removeAvatar;

export type FinalizeAvatarUploadResult = FunctionReturnType<FinalizeAvatarUploadRef>;
type RemoveAvatarResult = FunctionReturnType<RemoveAvatarRef>;

export interface UseAvatarUploadReturn {
  requestUploadUrlState: MutationState<
    FunctionReturnType<typeof api.users.avatar.requestAvatarUploadUrl>
  >;
  finalizeUploadState: ActionState<FinalizeAvatarUploadResult>;
  removeAvatarState: MutationState<RemoveAvatarResult>;
  uploadAvatar: (file: File) => Promise<Result<FinalizeAvatarUploadResult, AppErrorData>>;
  removeAvatar: () => Promise<Result<RemoveAvatarResult, AppErrorData>>;
}

const createInternalError = (message: string): AppErrorData => ({
  code: ErrorCode.INTERNAL_ERROR,
  category: ErrorCategory.INTERNAL,
  message,
  timestamp: new Date().toISOString(),
});

export function useAvatarUpload(): UseAvatarUploadReturn {
  const { mutate: requestAvatarUploadUrl, state: requestUploadUrlState } = useConvexMutation(
    api.users.avatar.requestAvatarUploadUrl,
  );
  const { execute: finalizeAvatarUpload, state: finalizeUploadState } = useConvexAction(
    api.users.avatar.finalizeAvatarUpload,
  );
  const { mutate: removeAvatar, state: removeAvatarState } = useConvexMutation(
    api.users.avatar.removeAvatar,
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<Result<FinalizeAvatarUploadResult, AppErrorData>> => {
      const uploadUrlResult = await requestAvatarUploadUrl({
        fileName: file.name,
        size: file.size,
        contentType: file.type || undefined,
      });

      if (uploadUrlResult.isErr()) {
        return err(uploadUrlResult.error);
      }

      let uploadResponse: Response;
      try {
        uploadResponse = await fetch(uploadUrlResult.value.url, {
          method: 'PUT',
          body: file,
          headers: file.type ? { 'Content-Type': file.type } : undefined,
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown upload failure';
        return err(createInternalError(`Failed to upload avatar to R2: ${details}`));
      }

      if (!uploadResponse.ok) {
        return err(
          createInternalError(`Avatar upload failed with status ${uploadResponse.status}.`),
        );
      }

      return finalizeAvatarUpload({
        key: uploadUrlResult.value.key,
      });
    },
    [requestAvatarUploadUrl, finalizeAvatarUpload],
  );

  const removeAvatarSafe = useCallback(async () => removeAvatar({}), [removeAvatar]);

  return {
    requestUploadUrlState,
    finalizeUploadState,
    removeAvatarState,
    uploadAvatar,
    removeAvatar: removeAvatarSafe,
  };
}
