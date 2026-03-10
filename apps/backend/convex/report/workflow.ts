import { WorkflowManager } from '@convex-dev/workflow';
import { v } from 'convex/values';

import { components, internal } from '../_generated/api';

export const runWorkflowManager = new WorkflowManager(components.workflow);

export const orchestrateRun = runWorkflowManager.define({
  args: { runId: v.id('runs') },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.report.internal.markRunStarted, {
        runId: args.runId,
      });

      await ctx.runMutation(internal.report.internal.markRunCompleted, {
        runId: args.runId,
      });
    } catch (error: unknown) {
      const errorSummary = error instanceof Error ? error.message : 'Run workflow failed';

      await ctx.runMutation(internal.report.internal.markRunFailed, {
        runId: args.runId,
        errorSummary,
      });

      throw error;
    }
  },
});
