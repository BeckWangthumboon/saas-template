import type { WorkflowId } from '@convex-dev/workflow';
import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';
import { mutation, query } from '../functions';
import { getWorkspaceMembership, requireWorkspaceAdminOrOwner } from '../workspaces/utils';
import { getTrackedProductForWorkspace } from './helpers';
import { runWorkflowManager } from './workflow';

const triggerTypeValidator = v.union(
  v.literal('baseline'),
  v.literal('scheduled'),
  v.literal('manual'),
);

export const scheduleRun = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    trackedProductId: v.id('trackedProducts'),
    providerName: v.string(),
    model: v.string(),
    triggerType: v.optional(triggerTypeValidator),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ runId: Id<'runs'>; workflowId: WorkflowId }> => {
    await requireWorkspaceAdminOrOwner(ctx, args.workspaceId, 'schedule_run');
    await getTrackedProductForWorkspace(ctx, args.trackedProductId, args.workspaceId);

    const activeRun = await ctx.db
      .query('runs')
      .withIndex('by_trackedProductId_status', (q) =>
        q.eq('trackedProductId', args.trackedProductId).eq('status', 'queued'),
      )
      .first();

    const runningRun = await ctx.db
      .query('runs')
      .withIndex('by_trackedProductId_status', (q) =>
        q.eq('trackedProductId', args.trackedProductId).eq('status', 'running'),
      )
      .first();

    if (activeRun || runningRun) {
      return throwAppErrorForConvex(ErrorCode.REQUEST_IN_FLIGHT);
    }

    const now = Date.now();
    const runId = await ctx.db.insert('runs', {
      workspaceId: args.workspaceId,
      trackedProductId: args.trackedProductId,
      status: 'queued',
      triggerType: args.triggerType ?? 'manual',
      providerName: args.providerName.trim(),
      model: args.model.trim(),
      currentStage: 'queued',
      scheduledFor: args.scheduledFor,
      totalQueries: 0,
      completedQueries: 0,
      failedQueries: 0,
      updatedAt: now,
    });

    const workflowId = await runWorkflowManager.start(
      ctx,
      internal.report.workflow.orchestrateRun,
      { runId },
    );

    await ctx.db.patch('runs', runId, {
      workflowId,
      updatedAt: Date.now(),
    });

    return { runId, workflowId };
  },
});

export const getRun = query({
  args: {
    workspaceId: v.id('workspaces'),
    runId: v.id('runs'),
  },
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);

    const run = await ctx.db.get('runs', args.runId);
    if (run?.workspaceId !== args.workspaceId) {
      return null;
    }

    const workflowStatus = run.workflowId
      ? await runWorkflowManager.status(ctx, run.workflowId as WorkflowId)
      : null;

    return {
      ...run,
      workflowStatus,
    };
  },
});

export const listRunsForTrackedProduct = query({
  args: {
    workspaceId: v.id('workspaces'),
    trackedProductId: v.id('trackedProducts'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);
    await getTrackedProductForWorkspace(ctx, args.trackedProductId, args.workspaceId);

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const runs = await ctx.db
      .query('runs')
      .withIndex('by_trackedProductId', (q) => q.eq('trackedProductId', args.trackedProductId))
      .order('desc')
      .take(limit);

    return Promise.all(
      runs.map(async (run) => ({
        ...run,
        workflowStatus: run.workflowId
          ? await runWorkflowManager.status(ctx, run.workflowId as WorkflowId)
          : null,
      })),
    );
  },
});

export const getTrackedProductRunStatusSummary = query({
  args: {
    workspaceId: v.id('workspaces'),
    trackedProductId: v.id('trackedProducts'),
  },
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);
    await getTrackedProductForWorkspace(ctx, args.trackedProductId, args.workspaceId);

    const latestRun = await ctx.db
      .query('runs')
      .withIndex('by_trackedProductId', (q) => q.eq('trackedProductId', args.trackedProductId))
      .order('desc')
      .first();

    if (!latestRun) {
      return {
        latestRun: null,
        hasInFlightRun: false,
      };
    }

    const workflowStatus = latestRun.workflowId
      ? await runWorkflowManager.status(ctx, latestRun.workflowId as WorkflowId)
      : null;

    return {
      latestRun: {
        ...latestRun,
        workflowStatus,
      },
      hasInFlightRun: latestRun.status === 'queued' || latestRun.status === 'running',
    };
  },
});
