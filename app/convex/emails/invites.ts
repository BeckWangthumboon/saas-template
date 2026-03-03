import { v } from 'convex/values';

import { convexEnv } from '../env';
import { internalAction } from '../functions';
import { logger } from '../logging';
import { resend } from './resend';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInviteRoleLabel = (role: 'admin' | 'member'): string => {
  return role === 'admin' ? 'Admin' : 'Member';
};

const formatDateUtc = (timestamp: number): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp));
};

/**
 * Sends a workspace invite email through the Resend component.
 *
 * Throws when enqueueing fails so failures are visible in scheduled job runs.
 */
export const sendWorkspaceInviteEmail = internalAction({
  args: {
    workspaceId: v.id('workspaces'),
    workspaceName: v.string(),
    inviteToken: v.string(),
    inviteeEmail: v.string(),
    inviteeRole: v.union(v.literal('admin'), v.literal('member')),
    inviterName: v.optional(v.string()),
    inviterEmail: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const inviterLabel = args.inviterName ?? args.inviterEmail;
    const inviteLink = new URL(`/invite/${args.inviteToken}`, convexEnv.appOrigin).toString();

    const inviteRoleLabel = formatInviteRoleLabel(args.inviteeRole);
    const expiresAtLabel = formatDateUtc(args.expiresAt);
    const safeWorkspaceName = escapeHtml(args.workspaceName);
    const safeInviterLabel = escapeHtml(inviterLabel);
    const safeInviteRole = escapeHtml(inviteRoleLabel);
    const safeExpiresAt = escapeHtml(expiresAtLabel);
    const safeInviteLink = escapeHtml(inviteLink);

    const subject = `You're invited to join ${args.workspaceName}`;
    const text = [
      `${inviterLabel} invited you to join ${args.workspaceName} as ${inviteRoleLabel}.`,
      `Accept invite: ${inviteLink}`,
      `This invite expires on ${expiresAtLabel} (UTC).`,
    ].join('\n');
    const html = [
      `<p>${safeInviterLabel} invited you to join <strong>${safeWorkspaceName}</strong> as ${safeInviteRole}.</p>`,
      `<p><a href="${safeInviteLink}">Accept invite</a></p>`,
      `<p>This invite expires on ${safeExpiresAt} (UTC).</p>`,
    ].join('');

    try {
      const emailId = await resend.sendEmail(ctx, {
        from: convexEnv.resendFromEmail,
        to: [args.inviteeEmail],
        subject,
        text,
        html,
        replyTo: [args.inviterEmail],
      });

      logger.info({
        event: 'invite.email.enqueued',
        category: 'INVITE',
        context: {
          emailId,
          workspaceId: args.workspaceId,
          inviteeEmail: args.inviteeEmail,
          inviteeRole: args.inviteeRole,
          testMode: convexEnv.resendTestMode,
        },
      });

      return null;
    } catch (error) {
      logger.error({
        event: 'invite.email.enqueue_failed',
        category: 'INVITE',
        context: {
          workspaceId: args.workspaceId,
          inviteeEmail: args.inviteeEmail,
          inviteeRole: args.inviteeRole,
          testMode: convexEnv.resendTestMode,
        },
        error,
      });

      throw error;
    }
  },
});
