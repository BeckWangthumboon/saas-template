import { CameraIcon, Trash2Icon } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    if (isBusy) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileSelected = async (file: File) => {
    const validationError = getAvatarValidationError(file);
    if (validationError) {
      toast.error('Invalid avatar', {
        description: validationError,
      });
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));

    const result = await uploadAvatar(file);

    if (result.isErr()) {
      setPreviewUrl(null);
      toast.error('Failed to upload avatar', {
        description: result.error.message,
      });
      return;
    }

    setPreviewUrl(null);
    toast.success('Avatar updated', {
      description: 'Your profile photo has been updated.',
    });
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || isBusy) {
      return;
    }

    void handleFileSelected(file);
  };

  const handleRemoveAvatar = async () => {
    const result = await removeAvatar();

    if (result.isErr()) {
      toast.error('Failed to remove avatar', {
        description: result.error.message,
      });
      return;
    }

    setPreviewUrl(null);

    toast.success('Avatar removed', {
      description: 'Your profile photo has been removed.',
    });
  };

  const displayAvatarUrl = previewUrl ?? user.profilePictureUrl;
  const initials = getUserInitials(user);
  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : 'No name set';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avatar</CardTitle>
        <CardDescription>Upload a profile photo for your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 text-xl">
              <AvatarImage src={displayAvatarUrl} alt={user.firstName ?? user.email} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-medium">{displayName}</p>
              <p className="text-muted-foreground text-sm">{user.email}</p>
              <p className="text-muted-foreground text-xs">JPG, PNG, WebP, or GIF up to 5 MB.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={AVATAR_INPUT_ACCEPT}
              className="sr-only"
              onChange={handleFileInputChange}
              tabIndex={-1}
              aria-hidden
            />

            <Button type="button" onClick={handleUploadClick} disabled={isBusy}>
              <CameraIcon className="size-4" />
              {isUploading ? 'Uploading...' : 'Upload new photo'}
            </Button>

            {user.avatarSource === 'custom' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRemoveAvatar()}
                disabled={isBusy}
              >
                <Trash2Icon className="size-4" />
                {isRemoving ? 'Removing...' : 'Remove photo'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
