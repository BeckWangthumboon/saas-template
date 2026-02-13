import { type AuthFunctions, AuthKit } from '@convex-dev/workos-authkit';

import { components, internal } from '../_generated/api';
import type { DataModel } from '../_generated/dataModel';
import { logger } from '../logging';
import { getUserByAuthId, handleUserDeleted } from './helpers';

const authFunctions: AuthFunctions = internal.users.auth;

const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
});

export const { authKitEvent } = authKit.events({
  /**
   * Handles 'user.created' event from WorkOS.
   * Updates missing user fields if the user exists, or inserts a new user. (idempotent)
   *
   * @param ctx - Event context
   * @param event - WorkOS user event
   */
  'user.created': async (ctx, event) => {
    const existingUser = await getUserByAuthId(ctx, event.data.id);

    if (existingUser) {
      const updates: Record<string, string> = {};
      if (!existingUser.firstName && event.data.firstName) {
        updates.firstName = event.data.firstName;
      }
      if (!existingUser.lastName && event.data.lastName) {
        updates.lastName = event.data.lastName;
      }
      if (!existingUser.profilePictureUrl && event.data.profilePictureUrl) {
        updates.profilePictureUrl = event.data.profilePictureUrl;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch('users', existingUser._id, {
          ...updates,
          updatedAt: Date.now(),
        });

        logger.info({
          event: 'auth.webhook_user_created_updated_existing',
          category: 'AUTH',
          context: {
            userId: existingUser._id,
            updatedFields: Object.keys(updates),
          },
        });
      }
      return;
    }

    const userId = await ctx.db.insert('users', {
      authId: event.data.id,
      email: event.data.email,
      firstName: event.data.firstName ?? undefined,
      lastName: event.data.lastName ?? undefined,
      profilePictureUrl: event.data.profilePictureUrl ?? undefined,
      onboardingStatus: 'not_started',
      updatedAt: Date.now(),
      status: 'active',
    });

    logger.info({
      event: 'auth.webhook_user_created_inserted',
      category: 'AUTH',
      context: {
        userId,
      },
    });
  },
  /**
   * Handles 'user.updated' events from WorkOS.
   * Updates the user's email and profile picture URL
   *
   * @param ctx - Event context
   * @param event - WorkOS user event
   */
  'user.updated': async (ctx, event) => {
    const user = await getUserByAuthId(ctx, event.data.id);
    if (!user) {
      return;
    }
    await ctx.db.patch('users', user._id, {
      email: event.data.email,
      profilePictureUrl: event.data.profilePictureUrl ?? undefined,
      updatedAt: Date.now(),
    });

    logger.info({
      event: 'auth.webhook_user_updated',
      category: 'AUTH',
      context: {
        userId: user._id,
      },
    });
  },

  /**
   * Handles 'user.deleted' events from WorkOS.
   * Cleans up local user data when a user is deleted from WorkOS.
   * Idempotent - safe to call multiple times.
   *
   * @param ctx - Event context
   * @param event - WorkOS user event
   */
  'user.deleted': async (ctx, event) => {
    await handleUserDeleted(ctx, event.data.id);

    logger.warn({
      event: 'auth.webhook_user_deleted',
      category: 'AUTH',
      context: {
        authId: event.data.id,
      },
    });
  },
});

export { authKit };
