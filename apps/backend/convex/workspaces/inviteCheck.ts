'use node';

import { AUTUMN_FEATURE_IDS } from '@saas/shared/billing/ids';
import { ErrorCode, parseAppError } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { check } from '../billing/autumn';
import { throwAppErrorForConvex } from '../errors';
import { internalAction } from '../functions';
import { logger } from '../logging';

function assertAutumnInviteAccess(
  workspaceId: Id<'workspaces'>,
  checkResult: Awaited<ReturnType<typeof check>>,
) {
  if (checkResult.error) {
    logger.error({
      event: 'invite.create_autumn_check_failed',
      category: 'INVITE',
      context: {
        workspaceId,
        errorCode: checkResult.error.code,
      },
      error: checkResult.error,
    });

    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Autumn invite access check failed',
    });
  }

  if (!checkResult.data.allowed) {
    return throwAppErrorForConvex(ErrorCode.BILLING_PLAN_REQUIRED, {
      workspaceId: workspaceId as string,
      feature: 'invites',
    });
  }
}

export const processCreateInviteRequest = internalAction({
  args: {
    requestId: v.id('inviteRequests'),
    workspaceId: v.id('workspaces'),
    workspaceKey: v.string(),
    workspaceName: v.string(),
    email: v.string(),
    inviteeRole: v.union(v.literal('admin'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    try {
      const access = await check({
        workspace: {
          workspaceId: args.workspaceId,
          workspaceKey: args.workspaceKey,
          workspaceName: args.workspaceName,
        },
        featureId: AUTUMN_FEATURE_IDS.invites,
      });

      assertAutumnInviteAccess(args.workspaceId, access);

      await ctx.runMutation(internal.workspaces.invites.createInviteAfterAutumnCheck, {
        requestId: args.requestId,
        workspaceId: args.workspaceId,
        email: args.email,
        inviteeRole: args.inviteeRole,
      });
    } catch (error) {
      const appError = parseAppError(error);

      await ctx.runMutation(internal.workspaces.invites.failCreateInviteRequest, {
        requestId: args.requestId,
        errorCode: appError?.code ?? ErrorCode.INTERNAL_ERROR,
      });
    }

    return null;
  },
});
