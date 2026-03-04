import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import { type AppErrorData, ErrorCategory, ErrorCode } from '@saas/shared/errors';
import type { FunctionReturnType } from 'convex/server';
import { err, type Result } from 'neverthrow';
import { useCallback } from 'react';

import {
  type ActionState,
  type MutationState,
  type QueryState,
  useConvexAction,
  useConvexMutation,
  useConvexQuery,
} from '@/hooks';

type ListWorkspaceFilesRef = typeof api.workspaceFiles.index.listWorkspaceFiles;
type FinalizeWorkspaceFileUploadRef = typeof api.workspaceFiles.upload.finalizeWorkspaceFileUpload;
type GetWorkspaceFileRef = typeof api.workspaceFiles.index.getWorkspaceFile;
type DeleteWorkspaceFileRef = typeof api.workspaceFiles.index.deleteWorkspaceFile;

export type WorkspaceFileRecord = FunctionReturnType<ListWorkspaceFilesRef>[number];
export type FinalizeWorkspaceFileUploadResult = FunctionReturnType<FinalizeWorkspaceFileUploadRef>;
export type WorkspaceFileDownloadResult = FunctionReturnType<GetWorkspaceFileRef>;
type DeleteWorkspaceFileResult = FunctionReturnType<DeleteWorkspaceFileRef>;

export interface UseWorkspaceFilesReturn {
  files: WorkspaceFileRecord[];
  filesState: QueryState<FunctionReturnType<ListWorkspaceFilesRef>>;
  requestUploadUrlState: MutationState<
    FunctionReturnType<typeof api.workspaceFiles.upload.requestWorkspaceFileUploadUrl>
  >;
  finalizeUploadState: ActionState<FinalizeWorkspaceFileUploadResult>;
  getWorkspaceFileState: ActionState<WorkspaceFileDownloadResult>;
  deleteWorkspaceFileState: MutationState<DeleteWorkspaceFileResult>;
  uploadFile: (file: File) => Promise<Result<FinalizeWorkspaceFileUploadResult, AppErrorData>>;
  getFile: (
    fileId: Id<'workspaceFiles'>,
    expiresInSeconds?: number,
  ) => Promise<Result<WorkspaceFileDownloadResult, AppErrorData>>;
  deleteFile: (
    fileId: Id<'workspaceFiles'>,
  ) => Promise<Result<DeleteWorkspaceFileResult, AppErrorData>>;
}

const createInternalError = (message: string): AppErrorData => ({
  code: ErrorCode.INTERNAL_ERROR,
  category: ErrorCategory.INTERNAL,
  message,
  timestamp: new Date().toISOString(),
});

export function useWorkspaceFiles(workspaceId: string | null): UseWorkspaceFilesReturn {
  const workspaceIdValue = workspaceId as Id<'workspaces'> | null;
  const filesState = useConvexQuery(
    api.workspaceFiles.index.listWorkspaceFiles,
    workspaceIdValue ? { workspaceId: workspaceIdValue } : 'skip',
  );
  const files = filesState.status === 'success' ? filesState.data : [];

  const { mutate: requestWorkspaceFileUploadUrl, state: requestUploadUrlState } = useConvexMutation(
    api.workspaceFiles.upload.requestWorkspaceFileUploadUrl,
  );
  const { execute: finalizeWorkspaceFileUpload, state: finalizeUploadState } = useConvexAction(
    api.workspaceFiles.upload.finalizeWorkspaceFileUpload,
  );
  const { execute: getWorkspaceFile, state: getWorkspaceFileState } = useConvexAction(
    api.workspaceFiles.index.getWorkspaceFile,
  );
  const { mutate: deleteWorkspaceFile, state: deleteWorkspaceFileState } = useConvexMutation(
    api.workspaceFiles.index.deleteWorkspaceFile,
  );

  const uploadFile = useCallback(
    async (file: File): Promise<Result<FinalizeWorkspaceFileUploadResult, AppErrorData>> => {
      if (!workspaceIdValue) {
        return err(createInternalError('Workspace is required to upload a file.'));
      }

      const uploadUrlResult = await requestWorkspaceFileUploadUrl({
        workspaceId: workspaceIdValue,
        fileName: file.name,
        size: file.size,
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
        return err(createInternalError(`Failed to upload file to R2: ${details}`));
      }

      if (!uploadResponse.ok) {
        return err(createInternalError(`R2 upload failed with status ${uploadResponse.status}.`));
      }

      return finalizeWorkspaceFileUpload({
        workspaceId: workspaceIdValue,
        key: uploadUrlResult.value.key,
        fileName: uploadUrlResult.value.fileName,
      });
    },
    [workspaceIdValue, requestWorkspaceFileUploadUrl, finalizeWorkspaceFileUpload],
  );

  const getFile = useCallback(
    async (
      fileId: Id<'workspaceFiles'>,
      expiresInSeconds?: number,
    ): Promise<Result<WorkspaceFileDownloadResult, AppErrorData>> => {
      if (!workspaceIdValue) {
        return err(createInternalError('Workspace is required to fetch a file.'));
      }

      return getWorkspaceFile({
        workspaceId: workspaceIdValue,
        fileId,
        expiresInSeconds,
      });
    },
    [workspaceIdValue, getWorkspaceFile],
  );

  const deleteFile = useCallback(
    async (
      fileId: Id<'workspaceFiles'>,
    ): Promise<Result<DeleteWorkspaceFileResult, AppErrorData>> => {
      if (!workspaceIdValue) {
        return err(createInternalError('Workspace is required to delete a file.'));
      }

      return deleteWorkspaceFile({
        workspaceId: workspaceIdValue,
        fileId,
      });
    },
    [workspaceIdValue, deleteWorkspaceFile],
  );

  return {
    files,
    filesState,
    requestUploadUrlState,
    finalizeUploadState,
    getWorkspaceFileState,
    deleteWorkspaceFileState,
    uploadFile,
    getFile,
    deleteFile,
  };
}
