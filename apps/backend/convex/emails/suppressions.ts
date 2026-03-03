import type { MutationCtx, QueryCtx } from '../functions';
import { logger } from '../logging';

export type EmailSuppressionReason = 'bounce' | 'spam' | 'manual';

type EmailSuppressionSource = 'resend_webhook' | 'manual';

interface UpsertEmailSuppressionInput {
  email: string;
  reason: EmailSuppressionReason;
  source: EmailSuppressionSource;
  eventType?: string;
  details?: string;
}

/**
 * Lowercases and trims an email address for canonical storage and lookup.
 */
export const normalizeEmailAddress = (email: string): string => {
  const firstSegment = email.trim().split(',')[0]?.trim() ?? '';
  const angleMatch = /<([^>]+)>/.exec(firstSegment);
  const candidate = angleMatch?.[1] ?? firstSegment;
  return candidate.trim().toLowerCase();
};

/**
 * Loads the suppression record for an email, if one exists.
 *
 * @param ctx - Convex query/mutation context.
 * @param email - Raw email address.
 * @returns Suppression row or null.
 */
export async function getEmailSuppressionByEmail(ctx: QueryCtx | MutationCtx, email: string) {
  const normalizedEmail = normalizeEmailAddress(email);

  const suppression = await ctx.db
    .query('emailSuppressions')
    .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
    .unique();

  return suppression ?? null;
}

/**
 * Creates or updates a suppression record, keeping one row per normalized email.
 *
 * @param ctx - Convex mutation context.
 * @param input - Suppression details.
 */
export async function upsertEmailSuppressionRecord(
  ctx: MutationCtx,
  input: UpsertEmailSuppressionInput,
) {
  const normalizedEmail = normalizeEmailAddress(input.email);

  const existing = await ctx.db
    .query('emailSuppressions')
    .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
    .unique();

  if (existing) {
    await ctx.db.patch('emailSuppressions', existing._id, {
      reason: input.reason,
      source: input.source,
      eventType: input.eventType,
      details: input.details,
    });
  } else {
    await ctx.db.insert('emailSuppressions', {
      email: normalizedEmail,
      reason: input.reason,
      source: input.source,
      eventType: input.eventType,
      details: input.details,
    });
  }

  logger.warn({
    event: 'email.suppression.upserted',
    category: 'INVITE',
    context: {
      email: normalizedEmail,
      reason: input.reason,
      source: input.source,
      eventType: input.eventType,
    },
  });
}
