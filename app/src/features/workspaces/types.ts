import type { FunctionReturnType } from 'convex/server';

import type { api } from '../../../convex/_generated/api';

export type Role = 'owner' | 'admin' | 'member';

export type Member = FunctionReturnType<typeof api.workspace.getWorkspaceMembers>[number];

export type Invite = FunctionReturnType<typeof api.invite.getWorkspaceInvites>[number];
