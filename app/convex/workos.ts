import { Workpool } from '@convex-dev/workpool';
import { WorkOS } from '@workos-inc/node';
import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import { components } from './_generated/api';
import { internalAction } from './functions';

/**
 * Creates a WorkOS client instance.
 * Use this factory function to get a properly configured WorkOS client.
 */
export function getWorkOS(): WorkOS {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'WORKOS_API_KEY environment variable is not set',
    });
  }
  return new WorkOS(apiKey);
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

export const workosWorkpool = new Workpool(components.workosWorkpool, {
  maxParallelism: 20,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 5, initialBackoffMs: 1000, base: 2 },
});

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
        return { kind: 'not_found' };
      }
      if (workosError.status === 429) {
        return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_RATE_LIMIT);
      }
      return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
        operation: 'getUser',
        status: workosError.status,
        message: workosError.message,
      });
    }
  },
});

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
        return { kind: 'deleted' } as const;
      }
      if (workosError.status === 429) {
        return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_RATE_LIMIT);
      }
      return throwAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, {
        operation: 'deleteUser',
        status: workosError.status,
        message: workosError.message,
      });
    }
  },
});
