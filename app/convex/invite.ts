import { v } from 'convex/values';

import { ErrorCode, throwAppErrorForConvex } from '../shared/errors';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query, type QueryCtx } from './functions';
import { getAuthenticatedUser } from './user';
import { requireWorkspaceAdminOrOwner } from './workspace';

// 7 days
const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

type InviteRole = 'admin' | 'member';

interface InviterInfo {
  name: string | null;
  email: string;
}

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
async function getInviterInfo(
  ctx: QueryCtx | MutationCtx,
  invite: Doc<'workspaceInvites'>,
): Promise<InviterInfo> {
  const inviter = await ctx.db.get('users', invite.invitedByUserId);
  if (inviter) {
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
): Promise<{ membership: Doc<'workspaceMembers'>; user: Doc<'users'> }> {
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
  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique();

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
    isAlreadyMember: membership !== null && membership.status === 'active',
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

  return membership !== null && membership.status === 'active';
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
  if (!workspace) {
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
      return throwAppErrorForConvex(ErrorCode.INVITE_SELF_INVITE);
    }

    const invitingAdminAsAdmin = inviterRole === 'admin' && args.inviteeRole === 'admin';
    if (invitingAdminAsAdmin) {
      return throwAppErrorForConvex(ErrorCode.INVITE_ADMIN_CANNOT_INVITE_ADMIN);
    }

    // Look up invitee by email to get their userId (if they exist)
    const { user: inviteeUser, isAlreadyMember: inviteeIsAlreadyMember } = await lookupUserByEmail(
      ctx,
      args.workspaceId,
      normalizedEmail,
    );

    if (inviteeIsAlreadyMember) {
      return throwAppErrorForConvex(ErrorCode.INVITE_ALREADY_MEMBER, {
        email: normalizedEmail,
        workspaceId: args.workspaceId as string,
      });
    }

    const now = Date.now();
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
  handler: async (
    ctx,
    args,
  ): Promise<{
    workspaceName: string;
    role: InviteRole;
    inviterName: string | null;
    inviterEmail: string | null;
    expiresAt: number;
  }> => {
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
      status: 'active',
      updatedAt: now,
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
        .filter((invite) => invite.status === 'pending')
        .map(async (invite) => {
          const inviterInfo = await getInviterInfo(ctx, invite);
          return {
            _id: invite._id,
            email: invite.email,
            role: invite.role,
            invitedAt: invite._creationTime,
            expiresAt: invite.expiresAt,
            isExpired: invite.expiresAt < now,
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
