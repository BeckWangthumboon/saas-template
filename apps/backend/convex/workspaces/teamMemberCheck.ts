'use node';

import { AUTUMN_FEATURE_IDS } from '@saas/shared/billing/ids';
import { ErrorCode, parseAppError } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { autumn, toWorkspaceEntityArgs } from '../billing/autumn';
import { throwAppErrorForConvex } from '../errors';
import { internalAction } from '../functions';
import { logger } from '../logging';

interface TeamMemberAutumnContext {
  workspaceId: Id<'workspaces'>;
  workspaceKey: string;
  workspaceName: string;
}

function assertAutumnTeamMemberAccess(
  workspaceId: Id<'workspaces'>,
  checkResult: Awaited<ReturnType<typeof autumn.check>>,
) {
  if (checkResult.error) {
    logger.error({
      event: 'workspace.team_member_autumn_check_failed',
      category: 'WORKSPACE',
      context: {
        workspaceId,
        errorCode: checkResult.error.code,
      },
      error: checkResult.error,
    });

    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Autumn team member access check failed',
    });
  }

  if (!checkResult.data?.allowed) {
    return throwAppErrorForConvex(ErrorCode.BILLING_PLAN_REQUIRED, {
      workspaceId: workspaceId as string,
      feature: 'team_members',
    });
  }
}

export const processAcceptInviteRequest = internalAction({
  args: {
    requestId: v.id('teamMemberRequests'),
    workspaceId: v.id('workspaces'),
    workspaceKey: v.string(),
    workspaceName: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const access = await autumn.check(ctx, {
        featureId: AUTUMN_FEATURE_IDS.teamMembers,
        ...toWorkspaceEntityArgs({
          workspaceId: args.workspaceId,
          workspaceKey: args.workspaceKey,
          workspaceName: args.workspaceName,
        } satisfies TeamMemberAutumnContext),
      });

      assertAutumnTeamMemberAccess(args.workspaceId, access);

      await ctx.runMutation(internal.workspaces.invites.acceptInviteAfterAutumnCheck, {
        requestId: args.requestId,
        workspaceId: args.workspaceId,
        token: args.token,
      });
    } catch (error) {
      const appError = parseAppError(error);

      await ctx.runMutation(internal.workspaces.invites.failTeamMemberRequest, {
        requestId: args.requestId,
        errorCode: appError?.code ?? ErrorCode.INTERNAL_ERROR,
      });
    }

    return null;
  },
});
