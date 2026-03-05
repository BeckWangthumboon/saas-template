import { ErrorCode } from '@saas/shared/errors';

import { throwAppErrorForConvex } from '../errors';
import { triggers } from '../functions';
import { cleanupUserForDeletion, revokePendingInvitesForUser } from './helpers';

triggers.register('users', async (ctx, change) => {
  if (change.operation === 'delete') {
    await cleanupUserForDeletion(ctx, change.id, change.oldDoc.email);
    return;
  }

  const user = change.newDoc;
  if (user.status === 'deleted' && change.oldDoc?.status !== 'deleted') {
    await revokePendingInvitesForUser(ctx, user._id, change.oldDoc?.email);
  }

  if (
    user.status === 'active' &&
    (!user.authId ||
      !user.email ||
      user.authId.trim().length === 0 ||
      user.email.trim().length === 0)
  ) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Active users must have authId and email',
    });
  }

  if (
    user.status === 'deleted' &&
    (user.authId !== undefined ||
      user.email !== undefined ||
      user.firstName !== undefined ||
      user.lastName !== undefined ||
      user.profilePictureUrl !== undefined ||
      user.workosProfilePictureUrl !== undefined ||
      user.avatarSource !== undefined ||
      user.avatarKey !== undefined)
  ) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Deleted users cannot retain PII',
    });
  }
});
