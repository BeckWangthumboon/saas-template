import { v } from 'convex/values';

import { ErrorCode } from '../../shared/errors';
import type { Doc, Id } from '../_generated/dataModel';
import { getWorkspaceEntitlementsSnapshot } from '../entitlements/service';
import { throwAppErrorForConvex } from '../errors';
import { mutation, type MutationCtx, query, type QueryCtx } from '../functions';
import { logger } from '../logging';
import { getActiveUserByEmail, getActiveUserById, getAuthenticatedUser } from '../users/helpers';
import { isActiveWorkspace } from './helpers';
import { requireWorkspaceAdminOrOwner, type WorkspaceMembership } from './utils';

// 7 days
const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

type InviteRole = 'admin' | 'member';

function formatName(firstName: string | null, lastName: string | null): string | null {
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ');
  }
  return null;
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
): Promise<WorkspaceMembership> {
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
): Promise<{ user: Doc<'users'> | null; isAlreadyMember: boolean }> {
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
): Promise<boolean> {
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
): Promise<boolean> {
  const activeInvite = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_workspaceId_email', (q) => q.eq('workspaceId', workspaceId).eq('email', email))
    .filter((q) => q.and(q.eq(q.field('status'), 'pending'), q.gt(q.field('expiresAt'), now)))
    .first();
  return activeInvite !== null;
}

/** Result of validating an invite for acceptance */
interface ValidatedInvite {
  invite: Doc<'workspaceInvites'>;
  user: Doc<'users'>;
  workspace: Doc<'workspaces'>;
}

interface WorkspaceInviteEntitlements {
  limits: {
    members: number | null;
    invites: number | null;
  };
  features: {
    team_members: boolean;
  };
  usage: {
    memberCount: number;
    pendingInviteCount: number;
  };
  isLocked: boolean;
  graceEndsAt: number | undefined;
}

/**
 * Loads current workspace billing state and derived entitlements for invite flows.
 */
async function getWorkspaceInviteEntitlements(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  now: number,
): Promise<WorkspaceInviteEntitlements> {
  const { entitlements } = await getWorkspaceEntitlementsSnapshot(ctx, workspaceId, now);

  return {
    limits: {
      members: entitlements.limits.members,
      invites: entitlements.limits.invites,
    },
    features: {
      team_members: entitlements.features.team_members,
    },
    usage: {
      memberCount: entitlements.usage.memberCount,
      pendingInviteCount: entitlements.usage.pendingInviteCount,
    },
    isLocked: entitlements.isLocked,
    graceEndsAt: entitlements.graceEndsAt,
  };
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

/**
 * Ensures invite creation is allowed under current plan and billing lock state.
 */
function assertCanCreateInvite(
  workspaceId: Id<'workspaces'>,
  entitlements: WorkspaceInviteEntitlements,
): void {
  if (entitlements.isLocked) {
    return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_LOCKED, {
      workspaceId: workspaceId as string,
      graceEndsAt: entitlements.graceEndsAt,
    });
  }

  if (!entitlements.features.team_members) {
    return throwAppErrorForConvex(ErrorCode.BILLING_PLAN_REQUIRED, {
      workspaceId: workspaceId as string,
      feature: 'team_members',
    });
  }
}

/**
 * Ensures invite acceptance is allowed under current plan and billing lock state.
 */
function assertCanAcceptInvite(
  workspaceId: Id<'workspaces'>,
  entitlements: WorkspaceInviteEntitlements,
): void {
  if (entitlements.isLocked) {
    return throwAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_LOCKED, {
      workspaceId: workspaceId as string,
      graceEndsAt: entitlements.graceEndsAt,
    });
  }

  if (!entitlements.features.team_members) {
    return throwAppErrorForConvex(ErrorCode.BILLING_PLAN_REQUIRED, {
      workspaceId: workspaceId as string,
      feature: 'team_members',
    });
  }

  if (
    entitlements.limits.members !== null &&
    entitlements.usage.memberCount >= entitlements.limits.members
  ) {
    return throwMemberLimitError(
      workspaceId,
      entitlements.usage.memberCount,
      entitlements.limits.members,
    );
  }
}

/**
 * Validates an invite token for acceptance.
 * Performs all checks: existence, status, expiration, email match, membership.
 *
 * @throws INVITE_NOT_FOUND if token doesn't match any invite.
 * @throws INVITE_ALREADY_ACCEPTED if invite was already used (includes `hasNewerInvite`).
 * @throws INVITE_ALREADY_REVOKED if invite was cancelled (includes `hasNewerInvite`).
 * @throws INVITE_EXPIRED if invite has expired (includes `hasNewerInvite`).
 * @throws INVITE_EMAIL_MISMATCH if user email doesn't match invite.
 * @throws INVITE_ALREADY_MEMBER if user is already a workspace member.
 */
async function validateInviteForAcceptance(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<ValidatedInvite> {
  const user = await getAuthenticatedUser(ctx);

  const invite = await ctx.db
    .query('workspaceInvites')
    .withIndex('by_token', (q) => q.eq('token', token))
    .unique();

  if (!invite) {
    return throwAppErrorForConvex(ErrorCode.INVITE_NOT_FOUND, { token });
  }

  const now = Date.now();

  // Check status
  if (invite.status === 'accepted') {
    const hasNewerInvite = await hasActiveInvite(ctx, invite.workspaceId, invite.email, now);
    return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_ACCEPTED, { token, hasNewerInvite });
  }
  if (invite.status === 'revoked') {
    const hasNewerInvite = await hasActiveInvite(ctx, invite.workspaceId, invite.email, now);
    return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_REVOKED, { token, hasNewerInvite });
  }

  if (invite.expiresAt < now) {
    const hasNewerInvite = await hasActiveInvite(ctx, invite.workspaceId, invite.email, now);
    return throwAppErrorForConvex(ErrorCode.INVITE_EXPIRED, { token, hasNewerInvite });
  }

  if (invite.invitedUserId) {
    if (user._id !== invite.invitedUserId) {
      return throwAppErrorForConvex(ErrorCode.INVITE_EMAIL_MISMATCH, {
        inviteEmail: invite.email,
        userEmail: user.email,
      });
    }
  } else {
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return throwAppErrorForConvex(ErrorCode.INVITE_EMAIL_MISMATCH, {
        inviteEmail: invite.email,
        userEmail: user.email,
      });
    }
  }

  const alreadyMember = await isUserAlreadyMember(ctx, invite.workspaceId, user._id);

  if (alreadyMember) {
    return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_MEMBER, {
      email: user.email,
      workspaceId: invite.workspaceId as string,
    });
  }

  const workspace = await ctx.db.get('workspaces', invite.workspaceId);
  if (!workspace || !isActiveWorkspace(workspace)) {
    return throwAppErrorForConvex(ErrorCode.INVITE_NOT_FOUND, { token });
  }

  return { invite, user, workspace };
}

/**
 * Creates an invite to join a workspace.
 * Owners can invite with admin or member roles.
 * Admins can only invite with member role.
 *
 * **Invite behavior:**
 * - If an active invite exists (pending + not expired), refreshes its expiration and returns `wasResent: true`
 * - If no active invite exists (expired, accepted, revoked, or none), creates a new invite
 * - Old invite records are preserved for audit history (never deleted)
 * - When refreshing, the original `invitedByUserId` is preserved
 *
 * @param workspaceId - The workspace to invite to.
 * @param email - The email address to invite.
 * @param inviteeRole - The role to assign ('admin' | 'member').
 * @returns The invite token, ID, and whether it was resent.
 * @throws INVITE_SELF_INVITE if inviting yourself.
 * @throws INVITE_ADMIN_CANNOT_INVITE_ADMIN if admin tries to invite as admin.
 * @throws INVITE_ALREADY_MEMBER if invitee is already an active member.
 * @throws WORKSPACE_INSUFFICIENT_ROLE if caller is a regular member.
 */
export const createInvite = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    email: v.string(),
    inviteeRole: v.union(v.literal('admin'), v.literal('member')),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ token: string; inviteId: Id<'workspaceInvites'>; wasResent: boolean }> => {
    const { membership, user } = await validateInvitePermission(ctx, args.workspaceId);
    const inviterRole = membership.role;
    const normalizedEmail = args.email.toLowerCase().trim();

    const invitingYourself = normalizedEmail === user.email.toLowerCase();
    if (invitingYourself) {
      logger.warn({
        event: 'invite.create_blocked_self_invite',
        category: 'INVITE',
        context: {
          workspaceId: args.workspaceId,
          inviterUserId: user._id,
        },
      });

      return throwAppErrorForConvex(ErrorCode.INVITE_SELF_INVITE);
    }

    const invitingAdminAsAdmin = inviterRole === 'admin' && args.inviteeRole === 'admin';
    if (invitingAdminAsAdmin) {
      logger.warn({
        event: 'invite.create_blocked_admin_role',
        category: 'INVITE',
        context: {
          workspaceId: args.workspaceId,
          inviterUserId: user._id,
          inviterRole,
          inviteeRole: args.inviteeRole,
        },
      });

      return throwAppErrorForConvex(ErrorCode.INVITE_ADMIN_CANNOT_INVITE_ADMIN);
    }

    const now = Date.now();
    const entitlements = await getWorkspaceInviteEntitlements(ctx, args.workspaceId, now);
    assertCanCreateInvite(args.workspaceId, entitlements);

    // Look up invitee by email to get their userId (if they exist)
    const { user: inviteeUser, isAlreadyMember: inviteeIsAlreadyMember } = await lookupUserByEmail(
      ctx,
      args.workspaceId,
      normalizedEmail,
    );

    if (inviteeIsAlreadyMember) {
      logger.warn({
        event: 'invite.create_blocked_already_member',
        category: 'INVITE',
        context: {
          workspaceId: args.workspaceId,
          inviterUserId: user._id,
        },
      });

      return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_MEMBER, {
        email: normalizedEmail,
        workspaceId: args.workspaceId as string,
      });
    }

    const expiresAt = now + INVITE_EXPIRATION_MS;

    const activeInvite = await ctx.db
      .query('workspaceInvites')
      .withIndex('by_workspaceId_email', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('email', normalizedEmail),
      )
      .filter((q) => q.and(q.eq(q.field('status'), 'pending'), q.gt(q.field('expiresAt'), now)))
      .first();

    if (activeInvite) {
      await ctx.db.patch('workspaceInvites', activeInvite._id, {
        expiresAt,
        role: args.inviteeRole,
        invitedUserId: inviteeUser?._id,
        updatedAt: now,
        inviterDisplayNameSnapshot:
          formatName(user.firstName ?? null, user.lastName ?? null) ?? undefined,
        inviterDisplayEmailSnapshot: user.email,
      });

      logger.info({
        event: 'invite.resent',
        category: 'INVITE',
        context: {
          inviteId: activeInvite._id,
          workspaceId: args.workspaceId,
          inviterUserId: user._id,
          inviteeRole: args.inviteeRole,
          invitedUserId: inviteeUser?._id,
        },
      });

      return {
        token: activeInvite.token,
        inviteId: activeInvite._id,
        wasResent: true,
      };
    }

    // If no active invite exists, generate new token and create invite
    const token = crypto.randomUUID();
    const inviteId = await ctx.db.insert('workspaceInvites', {
      workspaceId: args.workspaceId,
      email: normalizedEmail,
      role: args.inviteeRole,
      token,
      status: 'pending',
      invitedByUserId: user._id,
      invitedUserId: inviteeUser?._id,
      expiresAt,
      updatedAt: now,
      inviterDisplayNameSnapshot:
        formatName(user.firstName ?? null, user.lastName ?? null) ?? undefined,
      inviterDisplayEmailSnapshot: user.email,
    });

    logger.info({
      event: 'invite.created',
      category: 'INVITE',
      context: {
        inviteId,
        workspaceId: args.workspaceId,
        inviterUserId: user._id,
        inviteeRole: args.inviteeRole,
        invitedUserId: inviteeUser?._id,
      },
    });

    return { token, inviteId, wasResent: false };
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
    const { invite, workspace } = await validateInviteForAcceptance(ctx, args.token);
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
 * @param token - The invite token.
 * @returns The workspace ID, name, and assigned role.
 * @throws Same errors as `getInviteForAcceptance` (see `validateInviteForAcceptance`).
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ workspaceId: Id<'workspaces'>; workspaceName: string; role: InviteRole }> => {
    const { invite, user, workspace } = await validateInviteForAcceptance(ctx, args.token);
    const now = Date.now();

    const entitlements = await getWorkspaceInviteEntitlements(ctx, invite.workspaceId, now);
    assertCanAcceptInvite(invite.workspaceId, entitlements);

    // update invite to accepted and create membership
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

    return {
      workspaceId: invite.workspaceId,
      workspaceName: workspace.name,
      role: invite.role,
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
