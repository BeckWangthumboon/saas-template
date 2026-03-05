import { Workpool } from '@convex-dev/workpool';
import { v } from 'convex/values';

import { components, internal } from '../_generated/api';
import { internalAction, internalMutation, type MutationCtx } from '../functions';
import { logger } from '../logging';
import { deleteR2Object } from './r2Client';

const R2_DELETE_RETRY_BATCH_SIZE = 100;
const R2_DELETE_REQUEUE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const R2_DELETE_BACKOFF_SCHEDULE_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

const getR2DeleteNextAttemptAt = (attempts: number, baseTime: number) =>
  baseTime +
  R2_DELETE_BACKOFF_SCHEDULE_MS[Math.min(attempts - 1, R2_DELETE_BACKOFF_SCHEDULE_MS.length - 1)];

const r2DeleteRetryContextValidator = v.object({
  key: v.string(),
  reason: v.string(),
  source: v.string(),
});

interface R2DeleteRetryContext {
  key: string;
  reason: string;
  source: string;
}

/**
 * Workpool instance for deferred R2 delete retries.
 */
export const r2CleanupWorkpool = new Workpool(components.r2CleanupWorkpool, {
  maxParallelism: 20,
  retryActionsByDefault: false,
});

const getQueueEntryByKey = async (ctx: MutationCtx, key: string) => {
  return ctx.db
    .query('r2DeleteQueue')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
};

const recordR2DeleteFailure = async (
  ctx: MutationCtx,
  context: R2DeleteRetryContext,
  lastError: string,
  workId?: string,
) => {
  const existing = await getQueueEntryByKey(ctx, context.key);
  const attempts = (existing?.attempts ?? 0) + 1;
  const now = Date.now();
  const nextAttemptAt = getR2DeleteNextAttemptAt(attempts, now);

  if (existing) {
    await ctx.db.patch('r2DeleteQueue', existing._id, {
      reason: context.reason,
      source: context.source,
      attempts,
      nextAttemptAt,
      lastError,
      workId,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert('r2DeleteQueue', {
      key: context.key,
      reason: context.reason,
      source: context.source,
      attempts,
      nextAttemptAt,
      lastError,
      workId,
      updatedAt: now,
    });
  }

  return { attempts, nextAttemptAt };
};

/**
 * Performs a direct R2 delete in a mutation context.
 */
export const deleteR2ObjectNow = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await deleteR2Object(ctx, args.key);
    return { key: args.key };
  },
});

/**
 * Workpool action for deleting one R2 object key.
 */
export const deleteR2ObjectWork = internalAction({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.storage.deletes.deleteR2ObjectNow, {
      key: args.key,
    });
    return { key: args.key, deleted: true };
  },
});

/**
 * Handles completion for queued R2 delete work.
 * On failure, records durable retry state in r2DeleteQueue.
 */
export const deleteR2ObjectOnComplete = r2CleanupWorkpool.defineOnComplete({
  context: r2DeleteRetryContextValidator,
  handler: async (ctx, args) => {
    const { context, result } = args;
    const existing = await getQueueEntryByKey(ctx, context.key);

    if (result.kind === 'success') {
      if (existing) {
        await ctx.db.delete('r2DeleteQueue', existing._id);
      }

      logger.info({
        event: 'storage.r2.delete_work_completed',
        category: 'INTERNAL',
        context: {
          key: context.key,
          source: context.source,
          reason: context.reason,
        },
      });
      return;
    }

    const failureMessage = `R2 delete work failed (${result.kind})`;
    const { attempts, nextAttemptAt } = await recordR2DeleteFailure(
      ctx,
      context,
      failureMessage,
      existing?.workId,
    );

    logger.warn({
      event: 'storage.r2.delete_work_failed',
      category: 'INTERNAL',
      context: {
        key: context.key,
        source: context.source,
        reason: context.reason,
        resultKind: result.kind,
        attempts,
        nextAttemptAt,
      },
    });
  },
});

/**
 * Enqueues a deferred R2 delete operation.
 * If enqueue fails, records the key for cron-based retry.
 */
export const enqueueR2DeleteWork = async (ctx: MutationCtx, context: R2DeleteRetryContext) => {
  try {
    const workId = await r2CleanupWorkpool.enqueueAction(
      ctx,
      internal.storage.deletes.deleteR2ObjectWork,
      { key: context.key },
      {
        onComplete: internal.storage.deletes.deleteR2ObjectOnComplete,
        context,
        retry: false,
      },
    );

    return { enqueued: true, workId };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'enqueue_failed';
    const { attempts, nextAttemptAt } = await recordR2DeleteFailure(ctx, context, errorMessage);

    logger.error({
      event: 'storage.r2.delete_work_enqueue_failed',
      category: 'INTERNAL',
      context: {
        key: context.key,
        source: context.source,
        reason: context.reason,
        attempts,
        nextAttemptAt,
      },
      error,
    });

    return { enqueued: false, attempts, nextAttemptAt };
  }
};

/**
 * Tries inline delete first, then defers to workpool on failure.
 */
export const deleteR2ObjectOrDefer = async (ctx: MutationCtx, context: R2DeleteRetryContext) => {
  try {
    await deleteR2Object(ctx, context.key);
    return { deleted: true as const };
  } catch (error: unknown) {
    logger.warn({
      event: 'storage.r2.delete_inline_failed',
      category: 'INTERNAL',
      context: {
        key: context.key,
        source: context.source,
        reason: context.reason,
      },
      error,
    });

    await enqueueR2DeleteWork(ctx, context);
    return { deleted: false as const };
  }
};

/**
 * Re-enqueues failed R2 deletions that are due for another attempt.
 */
export const reconcileFailedR2Deletes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dueEntries = await ctx.db
      .query('r2DeleteQueue')
      .withIndex('by_nextAttemptAt', (q) => q.lt('nextAttemptAt', now))
      .take(R2_DELETE_RETRY_BATCH_SIZE);

    let requeuedCount = 0;

    for (const entry of dueEntries) {
      const enqueueResult = await enqueueR2DeleteWork(ctx, {
        key: entry.key,
        source: entry.source,
        reason: entry.reason,
      });

      if (enqueueResult.enqueued) {
        await ctx.db.patch('r2DeleteQueue', entry._id, {
          workId: enqueueResult.workId,
          nextAttemptAt: now + R2_DELETE_REQUEUE_COOLDOWN_MS,
          updatedAt: now,
        });
        requeuedCount += 1;
      }
    }

    if (dueEntries.length > 0) {
      logger.info({
        event: 'storage.r2.delete_queue_reconciled',
        category: 'INTERNAL',
        context: {
          dueCount: dueEntries.length,
          requeuedCount,
        },
      });
    }

    return {
      dueCount: dueEntries.length,
      requeuedCount,
    };
  },
});
