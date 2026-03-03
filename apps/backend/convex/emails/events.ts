import { type EmailEvent, vOnEmailEventArgs } from '@convex-dev/resend';
import { v } from 'convex/values';

import { internalMutation } from '../functions';
import { logger } from '../logging';
import { type EmailSuppressionReason, upsertEmailSuppressionRecord } from './suppressions';

const getPrimaryRecipientEmail = (value: string | string[]): string | null => {
  if (typeof value === 'string') {
    return value;
  }

  if (value.length === 0) {
    return null;
  }

  return value[0] ?? null;
};

const getSuppressionReasonFromEvent = (event: EmailEvent): EmailSuppressionReason | null => {
  if (event.type === 'email.bounced') {
    return 'bounce';
  }

  if (event.type === 'email.complained') {
    return 'spam';
  }

  return null;
};

const getSuppressionDetailsFromEvent = (event: EmailEvent): string | undefined => {
  if (event.type === 'email.bounced') {
    return event.data.bounce.message;
  }

  if (event.type === 'email.complained') {
    return 'Recipient marked email as spam';
  }

  return undefined;
};

/**
 * Universal Resend email event callback.
 *
 * This callback currently records suppressions for bounce/spam outcomes so
 * future sends can be blocked by email address.
 */
export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const reason = getSuppressionReasonFromEvent(args.event);

    if (!reason) {
      return null;
    }

    const recipientEmail = getPrimaryRecipientEmail(args.event.data.to);
    if (!recipientEmail) {
      logger.warn({
        event: 'email.event_missing_recipient',
        category: 'INVITE',
        context: {
          emailId: args.id,
          eventType: args.event.type,
        },
      });

      return null;
    }

    await upsertEmailSuppressionRecord(ctx, {
      email: recipientEmail,
      reason,
      source: 'resend_webhook',
      eventType: args.event.type,
      details: getSuppressionDetailsFromEvent(args.event),
    });

    logger.warn({
      event: 'email.suppression_recorded',
      category: 'INVITE',
      context: {
        emailId: args.id,
        eventType: args.event.type,
        reason,
      },
    });

    return null;
  },
});
