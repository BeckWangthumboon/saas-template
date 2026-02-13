import { ActionRetrier } from '@convex-dev/action-retrier';
import { Workpool } from '@convex-dev/workpool';
import { WorkOS } from '@workos-inc/node';
import { v } from 'convex/values';

import { ErrorCode } from '../../shared/errors';
import { components } from '../_generated/api';
import { convexEnv } from '../env';
import { throwAppErrorForConvex } from '../errors';
import { internalAction } from '../functions';
import { logger } from '../logging';

/**
 * Creates a WorkOS client instance.
 * Use this factory function to get a properly configured WorkOS client.
 */
export function getWorkOS(): WorkOS {
  return new WorkOS(convexEnv.workosApiKey);
}

export interface WorkosUserData {
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
}

export type WorkosUserFetchResult =
  | { kind: 'user'; userData: WorkosUserData }
  | { kind: 'not_found' };

/**
 * Workpool instance for WorkOS actions with retry configuration.
 */
export const workosWorkpool = new Workpool(components.workosWorkpool, {
  maxParallelism: 20,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 5, initialBackoffMs: 1000, base: 2 },
});

export const workosActionRetrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 500,
  base: 2,
  maxFailures: 4,
});

/**
 * Fetches a WorkOS user by authId.
 * Returns { kind: 'not_found' } for missing users and maps rate limits to app errors.
 */
export const fetchWorkosUser = internalAction({
  args: { authId: v.string() },
  handler: async (_ctx, args): Promise<WorkosUserFetchResult> => {
    const workos = getWorkOS();
    try {
      const workosUser = await workos.userManagement.getUser(args.authId);
      return {
        kind: 'user',
        userData: {
          email: workosUser.email,
          firstName: workosUser.firstName ?? undefined,
          lastName: workosUser.lastName ?? undefined,
          profilePictureUrl: workosUser.profilePictureUrl ?? undefined,
        },
      };
    } catch (error) {
      const workosError = error as { status?: number; message?: string };

      if (workosError.status === 404 || workosError.message?.toLowerCase().includes('not found')) {
        logger.warn({
          event: 'auth.workos.user_not_found',
          category: 'AUTH',
          context: {
            authId: args.authId,
            operation: 'getUser',
          },
        });

        return { kind: 'not_found' };
      }
      if (workosError.status === 429) {
        logger.warn({
          event: 'auth.workos.rate_limited',
          category: 'AUTH',
          context: {
            authId: args.authId,
            operation: 'getUser',
            status: workosError.status,
          },
        });

        return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_RATE_LIMIT);
      }

      logger.error({
        event: 'auth.workos.request_failed',
        category: 'AUTH',
        context: {
          authId: args.authId,
          operation: 'getUser',
          status: workosError.status,
        },
        error,
      });

      return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
        operation: 'getUser',
        status: workosError.status,
        message: workosError.message,
      });
    }
  },
});

/**
 * Deletes a WorkOS user by authId.
 * Idempotent for users that already do not exist.
 */
export const deleteWorkosUser = internalAction({
  args: { authId: v.string() },
  handler: async (_ctx, args) => {
    const workos = getWorkOS();
    try {
      await workos.userManagement.deleteUser(args.authId);
      return { kind: 'deleted' } as const;
    } catch (error) {
      const workosError = error as { status?: number; message?: string };
      if (workosError.status === 404 || workosError.message?.toLowerCase().includes('not found')) {
        logger.debug({
          event: 'auth.workos.user_delete_idempotent',
          category: 'AUTH',
          context: {
            authId: args.authId,
            operation: 'deleteUser',
          },
        });

        return { kind: 'deleted' } as const;
      }
      if (workosError.status === 429) {
        logger.warn({
          event: 'auth.workos.rate_limited',
          category: 'AUTH',
          context: {
            authId: args.authId,
            operation: 'deleteUser',
            status: workosError.status,
          },
        });

        return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_RATE_LIMIT);
      }

      logger.error({
        event: 'auth.workos.request_failed',
        category: 'AUTH',
        context: {
          authId: args.authId,
          operation: 'deleteUser',
          status: workosError.status,
        },
        error,
      });

      return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
        operation: 'deleteUser',
        status: workosError.status,
        message: workosError.message,
      });
    }
  },
});
