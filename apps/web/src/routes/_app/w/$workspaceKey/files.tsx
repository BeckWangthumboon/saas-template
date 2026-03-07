import type { Id } from '@saas/convex-api';
import { api } from '@saas/convex-api';
import { ErrorCode } from '@saas/shared/errors';
import { createFileRoute } from '@tanstack/react-router';
import type { FunctionReturnType } from 'convex/server';
import { DownloadIcon, FileIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isWorkspaceReady, useWorkspace, WorkspacePageHeading } from '@/features/workspaces';
import { useConvexAction, useConvexMutation, useConvexQuery } from '@/hooks';
import { formatRetryAfterDescription, getRetryAfterSeconds } from '@/lib/appErrors';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/w/$workspaceKey/files')({
  component: WorkspaceFilesPage,
});

const MAX_FILE_SIZE_MB = 50;
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
type ListWorkspaceFilesRef = typeof api.workspaceFiles.index.listWorkspaceFiles;
type WorkspaceFileRecord = FunctionReturnType<ListWorkspaceFilesRef>[number];
type SaveFilePickerFunction = (options?: {
  suggestedName?: string;
  types?: {
    description?: string;
    accept?: Record<string, string[]>;
  }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob | BufferSource | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

function formatTimestamp(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function getFileExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex);
}

async function saveFileWithPicker(params: { url: string; fileName: string; contentType?: string }) {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePickerFunction })
    .showSaveFilePicker;
  if (typeof picker !== 'function') {
    triggerDownload(params.url, params.fileName);
    return;
  }

  const response = await fetch(params.url);
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}.`);
  }

  const blob = await response.blob();
  const extension = getFileExtension(params.fileName);
  const mimeType = (params.contentType ?? blob.type) || 'application/octet-stream';
  const fileHandle = await picker({
    suggestedName: params.fileName,
    types: [
      {
        description: 'File',
        accept: {
          [mimeType]: extension ? [extension] : ['.*'],
        },
      },
    ],
  });

  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function WorkspaceFilesPage() {
  const workspaceContext = useWorkspace();

  if (!isWorkspaceReady(workspaceContext)) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading files...</p>
      </div>
    );
  }

  return <WorkspaceFilesPageContent workspaceId={workspaceContext.workspaceId} />;
}

function WorkspaceFilesPageContent({ workspaceId }: { workspaceId: string }) {
  const workspaceIdValue = workspaceId as Id<'workspaces'>;
  const filesState = useConvexQuery(api.workspaceFiles.index.listWorkspaceFiles, {
    workspaceId: workspaceIdValue,
  });
  const files = filesState.status === 'success' ? filesState.data : [];
  const { mutate: requestWorkspaceFileUploadUrl, state: requestUploadUrlState } = useConvexMutation(
    api.workspaceFiles.upload.requestWorkspaceFileUploadUrl,
  );
  const { execute: finalizeWorkspaceFileUpload, state: finalizeUploadState } = useConvexAction(
    api.workspaceFiles.upload.finalizeWorkspaceFileUpload,
  );
  const { execute: getWorkspaceFile } = useConvexAction(api.workspaceFiles.index.getWorkspaceFile);
  const { mutate: deleteWorkspaceFile, state: deleteWorkspaceFileState } = useConvexMutation(
    api.workspaceFiles.index.deleteWorkspaceFile,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<Id<'workspaceFiles'> | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<Id<'workspaceFiles'> | null>(null);
  const [filePendingDelete, setFilePendingDelete] = useState<WorkspaceFileRecord | null>(null);

  const isUploading =
    requestUploadUrlState.status === 'loading' || finalizeUploadState.status === 'loading';

  const handleUpload = async (selectedFile: File) => {
    const uploadUrlResult = await requestWorkspaceFileUploadUrl({
      workspaceId: workspaceIdValue,
      fileName: selectedFile.name,
      size: selectedFile.size,
    });

    if (uploadUrlResult.isErr()) {
      if (uploadUrlResult.error.code === ErrorCode.WORKSPACE_FILE_UPLOAD_RATE_LIMITED) {
        toast.error('Too many file upload attempts', {
          description: formatRetryAfterDescription(
            getRetryAfterSeconds(uploadUrlResult.error),
            'Please wait before uploading another file.',
          ),
        });
        return;
      }

      toast.error('Failed to upload file', {
        description: uploadUrlResult.error.message,
      });
      return;
    }

    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(uploadUrlResult.value.url, {
        method: 'PUT',
        body: selectedFile,
        headers: selectedFile.type ? { 'Content-Type': selectedFile.type } : undefined,
      });
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : 'Unknown upload failure';
      toast.error('Failed to upload file', {
        description: details,
      });
      return;
    }

    if (!uploadResponse.ok) {
      toast.error('Failed to upload file', {
        description: `Upload failed with status ${uploadResponse.status}.`,
      });
      return;
    }

    const finalizeResult = await finalizeWorkspaceFileUpload({
      workspaceId: workspaceIdValue,
      key: uploadUrlResult.value.key,
      fileName: uploadUrlResult.value.fileName,
    });
    if (finalizeResult.isErr()) {
      toast.error('Failed to finalize file upload', {
        description: finalizeResult.error.message,
      });
      return;
    }

    toast.success('File uploaded', {
      description: `${selectedFile.name} is now available in this workspace.`,
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);

    if (isUploading) {
      return;
    }

    const droppedFile = event.dataTransfer.files.item(0);
    if (droppedFile === null) {
      return;
    }

    void handleUpload(droppedFile);
  };

  const handleHiddenFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.item(0);
    if (selectedFile === null || !selectedFile) {
      return;
    }

    void handleUpload(selectedFile);
    event.target.value = '';
  };

  const handleDownload = async (file: WorkspaceFileRecord) => {
    setDownloadingFileId(file.fileId);
    try {
      const result = await getWorkspaceFile({
        workspaceId: workspaceIdValue,
        fileId: file.fileId,
      });
      if (result.isErr()) {
        toast.error('Failed to download file', {
          description: result.error.message,
        });
        return;
      }

      try {
        await saveFileWithPicker({
          url: result.value.url,
          fileName: result.value.fileName,
          contentType: result.value.contentType,
        });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        triggerDownload(result.value.url, result.value.fileName);
        toast.error('Could not open save dialog', {
          description: 'Started a regular browser download instead.',
        });
      }
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDelete = async () => {
    if (!filePendingDelete) {
      return;
    }

    setDeletingFileId(filePendingDelete.fileId);
    try {
      const result = await deleteWorkspaceFile({
        workspaceId: workspaceIdValue,
        fileId: filePendingDelete.fileId,
      });
      if (result.isErr()) {
        toast.error('Failed to delete file', {
          description: result.error.message,
        });
        return;
      }

      toast.success('File deleted', {
        description: `"${filePendingDelete.fileName}" has been removed from this workspace.`,
      });
      setFilePendingDelete(null);
    } finally {
      setDeletingFileId(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <WorkspacePageHeading
        title="Files"
        description="Upload and manage files shared with your workspace."
      />

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>Drag and drop a file to upload.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="button"
            tabIndex={0}
            aria-disabled={isUploading}
            onClick={() => {
              if (isUploading) return;
              fileInputRef.current?.click();
            }}
            onKeyDown={(event) => {
              if (isUploading) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              fileInputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (isUploading) return;
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              const relatedTarget = event.relatedTarget;
              if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
                return;
              }
              setIsDragActive(false);
            }}
            onDrop={handleDrop}
            className={cn(
              'border-border/70 bg-muted/20 rounded-xl border border-dashed p-10 transition-colors cursor-pointer',
              isDragActive && 'border-primary bg-primary/5',
              isUploading && 'pointer-events-none opacity-70',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={handleHiddenFileInputChange}
              tabIndex={-1}
              aria-hidden
            />
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="bg-background text-muted-foreground flex size-10 items-center justify-center rounded-full border">
                <UploadIcon className="size-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {isUploading ? 'Uploading file...' : 'Drop a file here or click to upload'}
                </p>
                <p className="text-muted-foreground text-xs">
                  Any file type, up to {MAX_FILE_SIZE_MB}MB.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stored Files</CardTitle>
          <CardDescription>Available files in this workspace.</CardDescription>
          <CardAction className="text-muted-foreground text-sm">
            {filesState.status === 'loading' ? 'Loading...' : `${files.length} total`}
          </CardAction>
        </CardHeader>
        <CardContent>
          {filesState.status === 'loading' ? (
            <p className="text-muted-foreground text-sm">Loading files...</p>
          ) : files.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
              No files uploaded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => {
                const isDownloading = downloadingFileId === file.fileId;
                const isDeleting = deletingFileId === file.fileId;

                return (
                  <div
                    key={file.fileId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                        <FileIcon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.fileName}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatFileSize(file.size)} · Uploaded {formatTimestamp(file.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isDownloading || isDeleting}
                        onClick={() => void handleDownload(file)}
                      >
                        <DownloadIcon className="size-4" />
                        {isDownloading ? 'Downloading...' : 'Download'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={isDownloading || isDeleting}
                        onClick={() => {
                          setFilePendingDelete(file);
                        }}
                      >
                        <Trash2Icon className="size-4" />
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={filePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && deleteWorkspaceFileState.status !== 'loading') {
            setFilePendingDelete(null);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogDescription>
              {filePendingDelete ? (
                <>
                  This will permanently delete <strong>{filePendingDelete.fileName}</strong> from
                  this workspace. This action cannot be undone.
                </>
              ) : (
                'This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={deletingFileId !== null} />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              disabled={filePendingDelete === null || deletingFileId !== null}
              onClick={() => void handleDelete()}
            >
              {deletingFileId !== null ? 'Deleting...' : 'Delete File'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
