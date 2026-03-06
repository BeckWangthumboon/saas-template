import { CameraIcon, CheckIcon, Loader2Icon, Trash2Icon, XIcon } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

import { useAvatarUpload } from './useAvatarUpload';
import type { User } from './UserContext';

const AVATAR_INPUT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;

function getUserInitials(user: Pick<User, 'firstName' | 'lastName' | 'email'>) {
  return (
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    user.email.charAt(0).toUpperCase() ||
    '?'
  );
}

function getAvatarValidationError(file: File) {
  if (!file.type.startsWith('image/')) {
    return 'Please choose an image file.';
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    return 'Avatar images must be 5 MB or smaller.';
  }

  return null;
}

export function AvatarSettingsCard({ user }: { user: User }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const {
    finalizeUploadState,
    removeAvatar,
    removeAvatarState,
    requestUploadUrlState,
    uploadAvatar,
  } = useAvatarUpload();

  const isUploading =
    requestUploadUrlState.status === 'loading' || finalizeUploadState.status === 'loading';
  const isRemoving = removeAvatarState.status === 'loading';
  const isBusy = isUploading || isRemoving;

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleUploadClick = () => {
    if (isBusy || pendingFile) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || isBusy) return;

    const validationError = getAvatarValidationError(file);
    if (validationError) {
      toast.error('Invalid avatar', { description: validationError });
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
  };

  const handleConfirm = async () => {
    if (!pendingFile) return;

    const result = await uploadAvatar(pendingFile);

    setPreviewUrl(null);
    setPendingFile(null);

    if (result.isErr()) {
      toast.error('Failed to upload avatar', { description: result.error.message });
      return;
    }

    toast.success('Avatar updated', { description: 'Your profile photo has been updated.' });
  };

  const handleCancel = () => {
    setPreviewUrl(null);
    setPendingFile(null);
  };

  const handleRemoveAvatar = async () => {
    const result = await removeAvatar();

    if (result.isErr()) {
      toast.error('Failed to remove avatar', { description: result.error.message });
      return;
    }

    toast.success('Avatar removed', { description: 'Your profile photo has been removed.' });
  };

  const displayAvatarUrl = previewUrl ?? user.profilePictureUrl;
  const initials = getUserInitials(user);
  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : 'No name set';

  return (
    <div className="flex items-center gap-4">
      <div
        className="group relative cursor-pointer"
        onClick={handleUploadClick}
        role="button"
        tabIndex={isBusy || pendingFile ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleUploadClick();
        }}
        aria-label="Change avatar"
      >
        <Avatar className="h-20 w-20 text-xl">
          <AvatarImage src={displayAvatarUrl} alt={user.firstName ?? user.email} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        {!isBusy && !pendingFile && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <CameraIcon className="size-6 text-white" />
          </div>
        )}

        {isBusy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
            <Loader2Icon className="size-6 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="font-medium">{displayName}</p>
        <p className="text-muted-foreground text-sm">{user.email}</p>

        {pendingFile ? (
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={() => void handleConfirm()} disabled={isBusy}>
              {isUploading ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <CheckIcon className="size-3" />
              )}
              Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isBusy}
            >
              <XIcon className="size-3" />
              Cancel
            </Button>
          </div>
        ) : (
          <>
            {user.avatarSource === 'custom' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 text-xs text-destructive hover:bg-transparent hover:text-destructive/80"
                onClick={() => void handleRemoveAvatar()}
                disabled={isBusy}
              >
                <Trash2Icon className="size-3" />
                {isRemoving ? 'Removing...' : 'Remove photo'}
              </Button>
            )}
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_INPUT_ACCEPT}
        className="sr-only"
        onChange={handleFileInputChange}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
