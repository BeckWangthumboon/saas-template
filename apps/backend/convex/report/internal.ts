import { v } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import { internalMutation, type MutationCtx } from '../functions';

type RunDoc = Doc<'runs'>;

const getRunOrThrow = async (ctx: MutationCtx, runId: Id<'runs'>): Promise<RunDoc> => {
  const run = await ctx.db.get('runs', runId);

  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  return run;
};

export const markRunStarted = internalMutation({
  args: { runId: v.id('runs') },
  handler: async (ctx, args) => {
    const run = await getRunOrThrow(ctx, args.runId);

    if (run.status !== 'queued') {
      return;
    }

    const now = Date.now();

    await ctx.db.patch('runs', run._id, {
      status: 'running',
      currentStage: 'running',
      startedAt: now,
      updatedAt: now,
    });
  },
});

export const markRunCompleted = internalMutation({
  args: { runId: v.id('runs') },
  handler: async (ctx, args) => {
    const run = await getRunOrThrow(ctx, args.runId);

    if (run.status === 'completed') {
      return;
    }

    const now = Date.now();

    await ctx.db.patch('runs', run._id, {
      status: 'completed',
      currentStage: 'completed',
      completedAt: now,
      updatedAt: now,
    });

    const trackedProduct = await ctx.db.get('trackedProducts', run.trackedProductId);
    if (trackedProduct?.status === 'active') {
      await ctx.db.patch('trackedProducts', trackedProduct._id, {
        latestRunId: run._id,
        updatedAt: now,
      });
    }
  },
});

export const markRunFailed = internalMutation({
  args: { runId: v.id('runs'), errorSummary: v.string() },
  handler: async (ctx, args) => {
    const run = await getRunOrThrow(ctx, args.runId);
    const now = Date.now();

    await ctx.db.patch('runs', run._id, {
      status: 'failed',
      currentStage: 'failed',
      errorSummary: args.errorSummary,
      failedAt: now,
      updatedAt: now,
    });
  },
});
