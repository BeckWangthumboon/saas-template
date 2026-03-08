import { ErrorCode } from '@saas/shared/errors';
import { v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { getEmailSuppressionByEmail } from '../emails/suppressions';
import { throwAppErrorForConvex } from '../errors';
import { internalMutation, mutation, type MutationCtx, query, type QueryCtx } from '../functions';
import { logger } from '../logging';
import { rateLimiter } from '../rateLimiter';
import { getActiveUserByEmail, getActiveUserById, getAuthenticatedUser } from '../users/helpers';
import { isActiveWorkspace } from './helpers';
import { requireWorkspaceAdminOrOwner } from './utils';

// 7 days
const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const TEAM_MEMBER_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
// Autumn gates access to team members, but active-member usage stays in Convex.
const MAX_WORKSPACE_MEMBERS = 50;

type InviteRole = 'admin' | 'member';
type InviteRequestStatus = 'pending' | 'completed' | 'failed';
type TeamMemberRequestStatus = 'pending' | 'completed' | 'failed';
type TeamMemberRequestOperation = 'accept_invite';

interface InviteCreationActor {
  membership: Doc<'workspaceMembers'>;
  user: Doc<'users'>;
}

interface PreparedInviteCreation {
  normalizedEmail: string;
  workspace: Doc<'workspaces'>;
  inviteeUser: Doc<'users'> | null;
  now: number;
  inviterDisplayName: string | undefined;
}

function formatName(firstName: string | null, lastName: string | null) {
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ');
  }
  return null;
}

interface ScheduleWorkspaceInviteEmailArgs {
  workspaceId: Id<'workspaces'>;
  workspaceName: string;
  inviteToken: string;
  inviteeEmail: string;
  inviteeRole: InviteRole;
  inviterName: string | undefined;
  inviterEmail: string;
  expiresAt: number;
}

/**
 * Schedules a background invite email send.
 */
async function scheduleWorkspaceInviteEmail(
  ctx: MutationCtx,
  args: ScheduleWorkspaceInviteEmailArgs,
) {
  try {
    await ctx.scheduler.runAfter(0, internal.emails.invites.sendWorkspaceInviteEmail, {
      workspaceId: args.workspaceId,
      workspaceName: args.workspaceName,
      inviteToken: args.inviteToken,
      inviteeEmail: args.inviteeEmail,
      inviteeRole: args.inviteeRole,
      inviterName: args.inviterName,
      inviterEmail: args.inviterEmail,
      expiresAt: args.expiresAt,
    });
  } catch (error) {
    logger.error({
      event: 'invite.email.schedule_failed',
      category: 'INVITE',
      context: {
        workspaceId: args.workspaceId,
        inviteeEmail: args.inviteeEmail,
        inviteeRole: args.inviteeRole,
      },
      error,
    });
    return throwAppErrorForConvex(ErrorCode.INVITE_EMAIL_SCHEDULE_FAILED, {
      workspaceId: args.workspaceId as string,
      inviteeEmail: args.inviteeEmail,
    });
  }
}

/**
 * Gets inviter information from an invite.
 * Uses current inviter data if the inviter exists, otherwise uses the snapshot.
 */
async function getInviterInfo(ctx: QueryCtx | MutationCtx, invite: Doc<'workspaceInvites'>) {
  const inviter = await ctx.db.get('users', invite.invitedByUserId);
  if (inviter?.status === 'active' && inviter.email) {
    return {
      name: formatName(inviter.firstName ?? null, inviter.lastName ?? null),
      email: inviter.email,
    };
  }

  return {
    name: invite.inviterDisplayNameSnapshot ?? null,
    email: invite.inviterDisplayEmailSnapshot,
  };
}

/**
 * Validates that the caller has permission to manage invites.
 * Owners can invite admins and members. Admins can only invite members.
 *
 * @returns The membership and user documents.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if caller is a regular member.
 */
async function validateInvitePermission(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
) {
  const { membership, user } = await requireWorkspaceAdminOrOwner(ctx, workspaceId, 'invite');

  return { membership, user };
}

/**
 * Looks up a user by email and checks if they're already an active member.
 *
 * @returns The user (if exists) and whether they're already a member.
 */
async function lookupUserByEmail(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  email: string,
) {
  const user = await getActiveUserByEmail(ctx, email);

  if (!user) {
    return { user: null, isAlreadyMember: false };
  }

  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_userId', (q) =>
      q.eq('workspaceId', workspaceId).eq('userId', user._id),
    )
    .unique();

  return {
    user,
    isAlreadyMember: membership !== null,
  };
}

/**
 * Checks if a user is already an active member of the workspace.
 */
async function isUserAlreadyMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
) {
  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_userId', (q) =>
      q.eq('workspaceId', workspaceId).eq('userId', userId),
    )
    .unique();

  if (!membership) {
    return false;
  }

  const user = await getActiveUserById(ctx, membership.userId);
  return user !== null;
}

/**
 * Checks if an active (pending + not expired) invite exists for the same workspace+email.
 */
async function hasActiveInvite(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  email: string,
  now: number,
) {
  const activeInvite = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId_email', (q) => q.eq('workspaceId', workspaceId).eq('email', email))
    .filter((q) => q.and(q.eq(q.field('status'), 'pending'), q.gt(q.field('expiresAt'), now)))
    .first();
  return activeInvite !== null;
}

async function getInviteCreationActor(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
) {
  const user = await getActiveUserById(ctx, userId);
  if (!user) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
      workspaceId: workspaceId as string,
    });
  }

  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_userId', (q) =>
      q.eq('workspaceId', workspaceId).eq('userId', userId),
    )
    .unique();

  if (!membership) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
      workspaceId: workspaceId as string,
    });
  }

  if (membership.role === 'member') {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, {
      workspaceId: workspaceId as string,
      requiredRole: 'admin',
      action: 'invite',
    });
  }

  return { membership, user };
}

async function prepareInviteCreation(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<'workspaces'>;
    email: string;
    inviteeRole: InviteRole;
  },
  actor: InviteCreationActor,
  options?: { enforceRateLimit?: boolean },
) {
  const inviterRole = actor.membership.role;
  const inviterEmail = actor.user.email;
  if (!inviterEmail) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Invite requester missing email',
    });
  }

  const normalizedEmail = args.email.toLowerCase().trim();

  if (normalizedEmail === inviterEmail.toLowerCase()) {
    logger.warn({
      event: 'invite.create_blocked_self_invite',
      category: 'INVITE',
      context: {
        workspaceId: args.workspaceId,
        inviterUserId: actor.user._id,
      },
    });

    return throwAppErrorForConvex(ErrorCode.INVITE_SELF_INVITE);
  }

  if (inviterRole === 'admin' && args.inviteeRole === 'admin') {
    logger.warn({
      event: 'invite.create_blocked_admin_role',
      category: 'INVITE',
      context: {
        workspaceId: args.workspaceId,
        inviterUserId: actor.user._id,
        inviterRole,
        inviteeRole: args.inviteeRole,
      },
    });

    return throwAppErrorForConvex(ErrorCode.INVITE_ADMIN_CANNOT_INVITE_ADMIN);
  }

  const activeSuppression = await getEmailSuppressionByEmail(ctx, normalizedEmail);
  if (activeSuppression) {
    logger.warn({
      event: 'invite.create_blocked_suppressed_email',
      category: 'INVITE',
      context: {
        workspaceId: args.workspaceId,
        inviterUserId: actor.user._id,
        inviteeEmail: normalizedEmail,
        reason: activeSuppression.reason,
      },
    });

    return throwAppErrorForConvex(ErrorCode.INVITE_EMAIL_SUPPRESSED, {
      inviteeEmail: normalizedEmail,
      reason: activeSuppression.reason,
    });
  }

  if (options?.enforceRateLimit ?? false) {
    const perUserStatus = await rateLimiter.limit(ctx, 'createInviteByUser', {
      key: actor.user._id,
    });
    if (!perUserStatus.ok) {
      logger.warn({
        event: 'invite.create_rate_limited',
        category: 'INVITE',
        context: {
          workspaceId: args.workspaceId,
          inviterUserId: actor.user._id,
          retryAfter: perUserStatus.retryAfter,
        },
      });

      return throwAppErrorForConvex(ErrorCode.INVITE_CREATE_RATE_LIMITED, {
        retryAfter: perUserStatus.retryAfter,
      });
    }
  }

  const workspace = await ctx.db.get('workspaces', args.workspaceId);
  if (!workspace || !isActiveWorkspace(workspace)) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
      workspaceId: args.workspaceId as string,
    });
  }

  const { user: inviteeUser, isAlreadyMember } = await lookupUserByEmail(
    ctx,
    args.workspaceId,
    normalizedEmail,
  );

  if (isAlreadyMember) {
    logger.warn({
      event: 'invite.create_blocked_already_member',
      category: 'INVITE',
      context: {
        workspaceId: args.workspaceId,
        inviterUserId: actor.user._id,
      },
    });

    return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_MEMBER, {
      email: normalizedEmail,
      workspaceId: args.workspaceId as string,
    });
  }

  return {
    normalizedEmail,
    workspace,
    inviteeUser,
    now: Date.now(),
    inviterDisplayName:
      formatName(actor.user.firstName ?? null, actor.user.lastName ?? null) ?? undefined,
  };
}

async function createOrResendInvite(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<'workspaces'>;
    inviteeRole: InviteRole;
  },
  actor: InviteCreationActor,
  prepared: PreparedInviteCreation,
) {
  const inviterEmail = actor.user.email;
  if (!inviterEmail) {
    return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
      details: 'Invite requester missing email',
    });
  }

  const expiresAt = prepared.now + INVITE_EXPIRATION_MS;

  const activeInvite = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId_email', (q) =>
      q.eq('workspaceId', args.workspaceId).eq('email', prepared.normalizedEmail),
    )
    .filter((q) =>
      q.and(q.eq(q.field('status'), 'pending'), q.gt(q.field('expiresAt'), prepared.now)),
    )
    .first();

  if (activeInvite) {
    await ctx.db.patch('workspaceInvites', activeInvite._id, {
      expiresAt,
      role: args.inviteeRole,
      invitedUserId: prepared.inviteeUser?._id,
      updatedAt: prepared.now,
      inviterDisplayNameSnapshot: prepared.inviterDisplayName,
      inviterDisplayEmailSnapshot: actor.user.email,
    });

    logger.info({
      event: 'invite.resent',
      category: 'INVITE',
      context: {
        inviteId: activeInvite._id,
        workspaceId: args.workspaceId,
        inviterUserId: actor.user._id,
        inviteeRole: args.inviteeRole,
        invitedUserId: prepared.inviteeUser?._id,
      },
    });

    await scheduleWorkspaceInviteEmail(ctx, {
      workspaceId: args.workspaceId,
      workspaceName: prepared.workspace.name,
      inviteToken: activeInvite.token,
      inviteeEmail: prepared.normalizedEmail,
      inviteeRole: args.inviteeRole,
      inviterName: prepared.inviterDisplayName,
      inviterEmail,
      expiresAt,
    });

    return {
      token: activeInvite.token,
      inviteId: activeInvite._id,
      wasResent: true,
    };
  }

  const token = crypto.randomUUID();
  const inviteId = await ctx.db.insert('workspaceInvites', {
    workspaceId: args.workspaceId,
    email: prepared.normalizedEmail,
    role: args.inviteeRole,
    token,
    status: 'pending',
    invitedByUserId: actor.user._id,
    invitedUserId: prepared.inviteeUser?._id,
    expiresAt,
    updatedAt: prepared.now,
    inviterDisplayNameSnapshot: prepared.inviterDisplayName,
    inviterDisplayEmailSnapshot: inviterEmail,
  });

  logger.info({
    event: 'invite.created',
    category: 'INVITE',
    context: {
      inviteId,
      workspaceId: args.workspaceId,
      inviterUserId: actor.user._id,
      inviteeRole: args.inviteeRole,
      invitedUserId: prepared.inviteeUser?._id,
    },
  });

  await scheduleWorkspaceInviteEmail(ctx, {
    workspaceId: args.workspaceId,
    workspaceName: prepared.workspace.name,
    inviteToken: token,
    inviteeEmail: prepared.normalizedEmail,
    inviteeRole: args.inviteeRole,
    inviterName: prepared.inviterDisplayName,
    inviterEmail,
    expiresAt,
  });

  return {
    token,
    inviteId,
    wasResent: false,
  };
}

async function getInviteRequest(ctx: QueryCtx | MutationCtx, requestId: Id<'inviteRequests'>) {
  return ctx.db.get('inviteRequests', requestId);
}

async function getTeamMemberRequest(
  ctx: QueryCtx | MutationCtx,
  requestId: Id<'teamMemberRequests'>,
) {
  return ctx.db.get('teamMemberRequests', requestId);
}

type AuthenticatedUser = Awaited<ReturnType<typeof getAuthenticatedUser>>;

/** Result of validating an invite for acceptance */
interface ValidatedInvite {
  invite: Doc<'workspaceInvites'>;
  user: AuthenticatedUser;
  workspace: Doc<'workspaces'>;
}

type InviteAcceptanceValidationResult =
  | { status: 'valid'; data: ValidatedInvite }
  | {
      status: 'already_accepted';
      data: ValidatedInvite;
      hasNewerInvite: boolean;
    }
  | {
      status: 'already_member';
      data: ValidatedInvite;
    }
  | {
      status: 'not_found';
    }
  | {
      status: 'revoked';
      hasNewerInvite: boolean;
    }
  | {
      status: 'expired';
      hasNewerInvite: boolean;
    }
  | {
      status: 'email_mismatch';
      inviteEmail: string;
      userEmail: string;
    };

/**
 * Ensures the authenticated user matches an invite recipient.
 *
 * If the invite was bound to a specific user ID, that takes precedence.
 * Otherwise the invite is matched by normalized email address.
 */
function getInviteRecipientMismatch(invite: Doc<'workspaceInvites'>, user: AuthenticatedUser) {
  if (invite.invitedUserId) {
    if (user._id !== invite.invitedUserId) {
      return {
        inviteEmail: invite.email,
        userEmail: user.email,
      };
    }

    return null;
  }

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return {
      inviteEmail: invite.email,
      userEmail: user.email,
    };
  }

  return null;
}

const throwMemberLimitError = (
  workspaceId: Id<'workspaces'>,
  currentUsage: number,
  maxAllowed: number,
) =>
  throwAppErrorForConvex(ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED, {
    workspaceId: workspaceId as string,
    limit: 'members',
    currentUsage,
    maxAllowed,
  });

function getInviteAcceptanceResult({ workspace }: Pick<ValidatedInvite, 'workspace'>) {
  return {
    workspaceKey: workspace.workspaceKey,
    workspaceName: workspace.name,
  };
}

async function getActiveWorkspaceMemberCount(ctx: MutationCtx, workspaceId: Id<'workspaces'>) {
  const memberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
    .collect();

  const users = await Promise.all(
    memberships.map((membership) => getActiveUserById(ctx, membership.userId)),
  );
  return users.filter((user) => user !== null).length;
}

async function recoverAcceptedInviteMembership(ctx: MutationCtx, validatedInvite: ValidatedInvite) {
  const { invite, user } = validatedInvite;

  if (invite.acceptedByUserId && invite.acceptedByUserId !== user._id) {
    return throwAppErrorForConvex(ErrorCode.INVITE_EMAIL_MISMATCH, {
      inviteEmail: invite.email,
      userEmail: user.email,
    });
  }

  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_userId', (q) =>
      q.eq('workspaceId', invite.workspaceId).eq('userId', user._id),
    )
    .unique();

  if (membership) {
    return;
  }

  const now = Date.now();
  await ctx.db.insert('workspaceMembers', {
    userId: user._id,
    workspaceId: invite.workspaceId,
    role: invite.role,
    updatedAt: now,
  });

  logger.warn({
    event: 'invite.accepted_recovered_membership',
    category: 'INVITE',
    context: {
      inviteId: invite._id,
      workspaceId: invite.workspaceId,
      userId: user._id,
      role: invite.role,
    },
  });
}

/**
 * Validates an invite token for acceptance and returns a non-throwing status.
 */
async function validateInviteForAcceptance(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<InviteAcceptanceValidationResult> {
  const user = await getAuthenticatedUser(ctx);

  const invite = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_token', (q) => q.eq('token', token))
    .unique();

  if (!invite) {
    return { status: 'not_found' };
  }

  const mismatch = getInviteRecipientMismatch(invite, user);
  if (mismatch) {
    return {
      status: 'email_mismatch',
      inviteEmail: mismatch.inviteEmail,
      userEmail: mismatch.userEmail,
    };
  }

  const workspace = await ctx.db.get('workspaces', invite.workspaceId);
  if (!workspace || !isActiveWorkspace(workspace)) {
    return { status: 'not_found' };
  }

  const now = Date.now();

  const validatedInvite: ValidatedInvite = { invite, user, workspace };

  if (invite.status === 'accepted') {
    const hasNewerInvite = await hasActiveInvite(ctx, invite.workspaceId, invite.email, now);
    return {
      status: 'already_accepted',
      data: validatedInvite,
      hasNewerInvite,
    };
  }

  if (invite.status === 'revoked') {
    const hasNewerInvite = await hasActiveInvite(ctx, invite.workspaceId, invite.email, now);
    return { status: 'revoked', hasNewerInvite };
  }

  if (invite.expiresAt < now) {
    const hasNewerInvite = await hasActiveInvite(ctx, invite.workspaceId, invite.email, now);
    return { status: 'expired', hasNewerInvite };
  }

  const alreadyMember = await isUserAlreadyMember(ctx, invite.workspaceId, user._id);
  if (alreadyMember) {
    return {
      status: 'already_member',
      data: validatedInvite,
    };
  }

  return { status: 'valid', data: validatedInvite };
}

/**
 * Maps non-valid invite acceptance statuses to typed app errors.
 */
function throwInviteAcceptanceValidationError(
  token: string,
  result: Exclude<InviteAcceptanceValidationResult, { status: 'valid' }>,
): never {
  switch (result.status) {
    case 'not_found':
      return throwAppErrorForConvex(ErrorCode.INVITE_NOT_FOUND, { token });
    case 'already_accepted':
      return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_ACCEPTED, {
        token,
        hasNewerInvite: result.hasNewerInvite,
      });
    case 'revoked':
      return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_REVOKED, {
        token,
        hasNewerInvite: result.hasNewerInvite,
      });
    case 'expired':
      return throwAppErrorForConvex(ErrorCode.INVITE_EXPIRED, {
        token,
        hasNewerInvite: result.hasNewerInvite,
      });
    case 'email_mismatch':
      return throwAppErrorForConvex(ErrorCode.INVITE_EMAIL_MISMATCH, {
        inviteEmail: result.inviteEmail,
        userEmail: result.userEmail,
      });
    case 'already_member':
      return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_MEMBER, {
        email: result.data.user.email,
        workspaceId: result.data.invite.workspaceId as string,
        workspaceKey: result.data.workspace.workspaceKey,
      });
  }
}

/**
 * Creates an invite request and schedules the Autumn-gated invite creation action.
 */
export const createInvite = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    email: v.string(),
    inviteeRole: v.union(v.literal('admin'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    const actor = await validateInvitePermission(ctx, args.workspaceId);
    const prepared = await prepareInviteCreation(ctx, args, actor, { enforceRateLimit: true });

    const now = Date.now();
    const requestId = await ctx.db.insert('inviteRequests', {
      workspaceId: args.workspaceId,
      requestedByUserId: actor.user._id,
      status: 'pending',
      expiresAt: now + INVITE_REQUEST_TTL_MS,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.workspaces.inviteCheck.processCreateInviteRequest, {
      requestId,
      workspaceId: args.workspaceId,
      workspaceKey: prepared.workspace.workspaceKey,
      workspaceName: prepared.workspace.name,
      email: args.email,
      inviteeRole: args.inviteeRole,
    });

    return { requestId };
  },
});

export const failCreateInviteRequest = internalMutation({
  args: {
    requestId: v.id('inviteRequests'),
    errorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await getInviteRequest(ctx, args.requestId);
    if (!request || request.status === 'completed') {
      return null;
    }

    await ctx.db.patch('inviteRequests', request._id, {
      status: 'failed' satisfies InviteRequestStatus,
      errorCode: args.errorCode,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const createInviteAfterAutumnCheck = internalMutation({
  args: {
    requestId: v.id('inviteRequests'),
    workspaceId: v.id('workspaces'),
    email: v.string(),
    inviteeRole: v.union(v.literal('admin'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    const request = await getInviteRequest(ctx, args.requestId);
    if (!request) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Invite request not found',
      });
    }
    if (request.workspaceId !== args.workspaceId) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Invite request workspace mismatch',
      });
    }

    if (request.status === 'completed' && request.resultInviteId) {
      const invite = await ctx.db.get('workspaceInvites', request.resultInviteId);
      if (!invite) {
        return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
          details: 'Completed invite request missing invite',
        });
      }

      return {
        inviteId: invite._id,
        token: invite.token,
        wasResent: request.wasResent ?? false,
      };
    }

    if (request.status === 'failed') {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Invite request already failed',
      });
    }

    const actor = await getInviteCreationActor(ctx, request.workspaceId, request.requestedByUserId);
    const prepared = await prepareInviteCreation(
      ctx,
      {
        workspaceId: args.workspaceId,
        email: args.email,
        inviteeRole: args.inviteeRole,
      },
      actor,
    );
    const result = await createOrResendInvite(
      ctx,
      {
        workspaceId: args.workspaceId,
        inviteeRole: args.inviteeRole,
      },
      actor,
      prepared,
    );

    await ctx.db.patch('inviteRequests', request._id, {
      status: 'completed' satisfies InviteRequestStatus,
      resultInviteId: result.inviteId,
      wasResent: result.wasResent,
      errorCode: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const getCreateInviteRequest = query({
  args: {
    requestId: v.id('inviteRequests'),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const request = await getInviteRequest(ctx, args.requestId);

    if (!request) {
      return {
        status: 'failed' as const,
        errorCode: ErrorCode.INTERNAL_ERROR,
      };
    }

    if (request.requestedByUserId !== user._id) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
        workspaceId: request.workspaceId as string,
      });
    }

    if (request.status === 'completed') {
      if (!request.resultInviteId) {
        return {
          status: 'failed' as const,
          errorCode: ErrorCode.INTERNAL_ERROR,
        };
      }

      const invite = await ctx.db.get('workspaceInvites', request.resultInviteId);
      if (!invite) {
        return {
          status: 'failed' as const,
          errorCode: ErrorCode.INTERNAL_ERROR,
        };
      }

      return {
        status: 'completed' as const,
        email: invite.email,
        inviteId: invite._id,
        token: invite.token,
        wasResent: request.wasResent ?? false,
      };
    }

    if (request.status === 'failed') {
      return {
        status: 'failed' as const,
        errorCode: request.errorCode ?? ErrorCode.INTERNAL_ERROR,
      };
    }

    return {
      status: request.status,
    };
  },
});

export const failTeamMemberRequest = internalMutation({
  args: {
    requestId: v.id('teamMemberRequests'),
    errorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await getTeamMemberRequest(ctx, args.requestId);
    if (!request || request.status === 'completed') {
      return null;
    }

    await ctx.db.patch('teamMemberRequests', request._id, {
      status: 'failed' satisfies TeamMemberRequestStatus,
      errorCode: args.errorCode,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const acceptInviteAfterAutumnCheck = internalMutation({
  args: {
    requestId: v.id('teamMemberRequests'),
    workspaceId: v.id('workspaces'),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await getTeamMemberRequest(ctx, args.requestId);
    if (!request) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Team member request not found',
      });
    }
    if (request.workspaceId !== args.workspaceId) {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Team member request workspace mismatch',
      });
    }

    if (
      request.status === 'completed' &&
      request.resultWorkspaceKey &&
      request.resultWorkspaceName
    ) {
      return {
        workspaceKey: request.resultWorkspaceKey,
        workspaceName: request.resultWorkspaceName,
      };
    }

    if (request.status === 'failed') {
      return throwAppErrorForConvex(ErrorCode.INTERNAL_ERROR, {
        details: 'Team member request already failed',
      });
    }

    const validation = await validateInviteForAcceptance(ctx, args.token);

    if (validation.status === 'already_accepted') {
      await recoverAcceptedInviteMembership(ctx, validation.data);

      logger.info({
        event: 'invite.accepted_idempotent',
        category: 'INVITE',
        context: {
          inviteId: validation.data.invite._id,
          workspaceId: validation.data.invite.workspaceId,
          userId: validation.data.user._id,
          role: validation.data.invite.role,
        },
      });

      const result = getInviteAcceptanceResult(validation.data);

      await ctx.db.patch('teamMemberRequests', request._id, {
        status: 'completed' satisfies TeamMemberRequestStatus,
        resultWorkspaceKey: result.workspaceKey,
        resultWorkspaceName: result.workspaceName,
        errorCode: undefined,
        updatedAt: Date.now(),
      });

      return result;
    }

    if (validation.status === 'already_member') {
      logger.info({
        event: 'invite.accepted_already_member',
        category: 'INVITE',
        context: {
          inviteId: validation.data.invite._id,
          workspaceId: validation.data.invite.workspaceId,
          userId: validation.data.user._id,
          role: validation.data.invite.role,
        },
      });

      const result = getInviteAcceptanceResult(validation.data);

      await ctx.db.patch('teamMemberRequests', request._id, {
        status: 'completed' satisfies TeamMemberRequestStatus,
        resultWorkspaceKey: result.workspaceKey,
        resultWorkspaceName: result.workspaceName,
        errorCode: undefined,
        updatedAt: Date.now(),
      });

      return result;
    }

    if (validation.status !== 'valid') {
      return throwInviteAcceptanceValidationError(args.token, validation);
    }

    const { invite, user, workspace } = validation.data;
    const memberCount = await getActiveWorkspaceMemberCount(ctx, invite.workspaceId);
    if (memberCount >= MAX_WORKSPACE_MEMBERS) {
      return throwMemberLimitError(invite.workspaceId, memberCount, MAX_WORKSPACE_MEMBERS);
    }

    const now = Date.now();
    await ctx.db.patch('workspaceInvites', invite._id, {
      status: 'accepted',
      acceptedByUserId: user._id,
      acceptedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('workspaceMembers', {
      userId: user._id,
      workspaceId: invite.workspaceId,
      role: invite.role,
      updatedAt: now,
    });

    logger.info({
      event: 'invite.accepted',
      category: 'INVITE',
      context: {
        inviteId: invite._id,
        workspaceId: invite.workspaceId,
        userId: user._id,
        role: invite.role,
      },
    });

    const result = getInviteAcceptanceResult({ workspace });

    await ctx.db.patch('teamMemberRequests', request._id, {
      status: 'completed' satisfies TeamMemberRequestStatus,
      resultWorkspaceKey: result.workspaceKey,
      resultWorkspaceName: result.workspaceName,
      errorCode: undefined,
      updatedAt: now,
    });

    return result;
  },
});

export const getAcceptInviteRequest = query({
  args: {
    requestId: v.id('teamMemberRequests'),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const request = await getTeamMemberRequest(ctx, args.requestId);

    if (!request) {
      return {
        status: 'failed' as const,
        errorCode: ErrorCode.INTERNAL_ERROR,
      };
    }

    if (request.requestedByUserId !== user._id) {
      return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
        workspaceId: request.workspaceId as string,
      });
    }

    if (request.status === 'completed') {
      if (!request.resultWorkspaceKey || !request.resultWorkspaceName) {
        return {
          status: 'failed' as const,
          errorCode: ErrorCode.INTERNAL_ERROR,
        };
      }

      return {
        status: 'completed' as const,
        workspaceKey: request.resultWorkspaceKey,
        workspaceName: request.resultWorkspaceName,
      };
    }

    if (request.status === 'failed') {
      return {
        status: 'failed' as const,
        errorCode: request.errorCode ?? ErrorCode.INTERNAL_ERROR,
      };
    }

    return {
      status: request.status,
    };
  },
});

/**
 * Gets invite details for the acceptance page.
 * Requires authentication to verify the user matches the invite.
 *
 * @param token - The invite token.
 * @returns Workspace name, role, and inviter info.
 * @throws Same errors as `acceptInvite` (see `validateInviteForAcceptance`).
 */
export const getInviteForAcceptance = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const validation = await validateInviteForAcceptance(ctx, args.token);
    if (validation.status !== 'valid') {
      return throwInviteAcceptanceValidationError(args.token, validation);
    }

    const { invite, workspace } = validation.data;
    const inviterInfo = await getInviterInfo(ctx, invite);

    return {
      workspaceName: workspace.name,
      role: invite.role,
      inviterName: inviterInfo.name,
      inviterEmail: inviterInfo.email,
      expiresAt: invite.expiresAt,
    };
  },
});

/**
 * Accepts an invite to join a workspace.
 * Validates by userId if the invitee existed at invite time, otherwise by email.
 *
 * This mutation is idempotent for accepted invites: when the invite has already
 * been accepted by the same user, it returns success instead of throwing.
 *
 * @param token - The invite token.
 * @returns The workspace ID, name, and assigned role.
 * @throws INVITE_NOT_FOUND if the token is unknown or workspace is no longer active.
 * @throws INVITE_ALREADY_REVOKED if invite was revoked.
 * @throws INVITE_EXPIRED if invite has expired.
 * @throws INVITE_EMAIL_MISMATCH if the authenticated user does not match invite recipient.
 * @throws INVITE_ACCEPT_RATE_LIMITED when invite acceptance limits are exceeded.
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const validation = await validateInviteForAcceptance(ctx, args.token);

    if (validation.status === 'already_accepted') {
      await recoverAcceptedInviteMembership(ctx, validation.data);

      logger.info({
        event: 'invite.accepted_idempotent',
        category: 'INVITE',
        context: {
          inviteId: validation.data.invite._id,
          workspaceId: validation.data.invite.workspaceId,
          userId: validation.data.user._id,
          role: validation.data.invite.role,
        },
      });

      return {
        status: 'completed' as const,
        ...getInviteAcceptanceResult(validation.data),
      };
    }

    if (validation.status === 'already_member') {
      logger.info({
        event: 'invite.accepted_already_member',
        category: 'INVITE',
        context: {
          inviteId: validation.data.invite._id,
          workspaceId: validation.data.invite.workspaceId,
          userId: validation.data.user._id,
          role: validation.data.invite.role,
        },
      });

      return {
        status: 'completed' as const,
        ...getInviteAcceptanceResult(validation.data),
      };
    }

    if (validation.status !== 'valid') {
      return throwInviteAcceptanceValidationError(args.token, validation);
    }

    const { invite, user, workspace } = validation.data;
    const rateLimitStatus = await rateLimiter.limit(ctx, 'acceptInviteByUser', {
      key: user.authId,
    });
    if (!rateLimitStatus.ok) {
      logger.warn({
        event: 'invite.accept_rate_limited',
        category: 'INVITE',
        context: {
          authId: user.authId,
          userId: user._id,
          retryAfter: rateLimitStatus.retryAfter,
        },
      });

      return throwAppErrorForConvex(ErrorCode.INVITE_ACCEPT_RATE_LIMITED, {
        retryAfter: rateLimitStatus.retryAfter,
      });
    }

    const now = Date.now();
    const requestId = await ctx.db.insert('teamMemberRequests', {
      workspaceId: invite.workspaceId,
      requestedByUserId: user._id,
      operation: 'accept_invite' satisfies TeamMemberRequestOperation,
      status: 'pending' satisfies TeamMemberRequestStatus,
      expiresAt: now + TEAM_MEMBER_REQUEST_TTL_MS,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.workspaces.teamMemberCheck.processAcceptInviteRequest,
      {
        requestId,
        workspaceId: invite.workspaceId,
        workspaceKey: workspace.workspaceKey,
        workspaceName: workspace.name,
        token: args.token,
      },
    );

    return {
      status: 'pending' as const,
      requestId,
    };
  },
});

/**
 * Revokes a pending invite.
 * Only owners and admins can revoke invites.
 *
 * @param inviteId - The ID of the invite to revoke.
 * @throws INVITE_NOT_FOUND if invite doesn't exist.
 * @throws INVITE_ALREADY_ACCEPTED if invite was already accepted.
 * @throws INVITE_ALREADY_REVOKED if invite was already revoked.
 */
export const revokeInvite = mutation({
  args: { inviteId: v.id('workspaceInvites') },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get('workspaceInvites', args.inviteId);

    if (!invite) {
      return throwAppErrorForConvex(ErrorCode.INVITE_NOT_FOUND, {
        inviteId: args.inviteId as string,
      });
    }
    await validateInvitePermission(ctx, invite.workspaceId);

    if (invite.status === 'accepted') {
      return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_ACCEPTED);
    }
    if (invite.status === 'revoked') {
      return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_REVOKED);
    }

    await ctx.db.patch('workspaceInvites', invite._id, {
      status: 'revoked',
      updatedAt: Date.now(),
    });

    logger.info({
      event: 'invite.revoked',
      category: 'INVITE',
      context: {
        inviteId: invite._id,
        workspaceId: invite.workspaceId,
      },
    });
  },
});

/**
 * Gets all pending invites for a workspace.
 * Only owners and admins can view invites.
 *
 * @param workspaceId - The workspace to get invites for.
 * @returns Array of pending invites with inviter info and expiration status.
 */
export const getWorkspaceInvites = query({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    await validateInvitePermission(ctx, args.workspaceId);

    const invites = await ctx.db
      .query('workspaceInvites')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
      .collect();

    const now = Date.now();

    const pendingInvites = await Promise.all(
      invites
        .filter((invite) => invite.status === 'pending' && invite.expiresAt >= now)
        .map(async (invite) => {
          const inviterInfo = await getInviterInfo(ctx, invite);
          return {
            _id: invite._id,
            token: invite.token,
            email: invite.email,
            role: invite.role,
            invitedAt: invite._creationTime,
            expiresAt: invite.expiresAt,
            inviter: {
              firstName: inviterInfo.name ? inviterInfo.name.split(' ')[0] : null,
              lastName: inviterInfo.name ? inviterInfo.name.split(' ').slice(1).join(' ') : null,
              email: inviterInfo.email,
            },
          };
        }),
    );

    return pendingInvites.sort((a, b) => b.invitedAt - a.invitedAt);
  },
});

export const cleanupExpiredInviteRequests = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query('inviteRequests')
      .withIndex('by_status_expiresAt', (q) => q.eq('status', 'pending').lt('expiresAt', now))
      .collect();
    const completed = await ctx.db
      .query('inviteRequests')
      .withIndex('by_status_expiresAt', (q) => q.eq('status', 'completed').lt('expiresAt', now))
      .collect();
    const failed = await ctx.db
      .query('inviteRequests')
      .withIndex('by_status_expiresAt', (q) => q.eq('status', 'failed').lt('expiresAt', now))
      .collect();

    for (const request of [...pending, ...completed, ...failed]) {
      await ctx.db.delete('inviteRequests', request._id);
    }

    return null;
  },
});

export const cleanupExpiredTeamMemberRequests = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query('teamMemberRequests')
      .withIndex('by_status_expiresAt', (q) => q.eq('status', 'pending').lt('expiresAt', now))
      .collect();
    const completed = await ctx.db
      .query('teamMemberRequests')
      .withIndex('by_status_expiresAt', (q) => q.eq('status', 'completed').lt('expiresAt', now))
      .collect();
    const failed = await ctx.db
      .query('teamMemberRequests')
      .withIndex('by_status_expiresAt', (q) => q.eq('status', 'failed').lt('expiresAt', now))
      .collect();

    for (const request of [...pending, ...completed, ...failed]) {
      await ctx.db.delete('teamMemberRequests', request._id);
    }

    return null;
  },
});
