import type { api } from '@saas/convex-api';
import type { FunctionReturnType } from 'convex/server';

export type Role = 'owner' | 'admin' | 'member';

export type Member = FunctionReturnType<typeof api.workspaces.members.getWorkspaceMembers>[number];

export type Invite = FunctionReturnType<typeof api.workspaces.invites.getWorkspaceInvites>[number];
