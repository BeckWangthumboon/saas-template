import { Autumn } from '@useautumn/convex';

import { components } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { convexEnv } from '../env';

interface AutumnIdentity {
  subject: string;
  name?: string | null;
  email?: string | null;
}

interface AutumnIdentifyCtx {
  auth: {
    getUserIdentity: () => Promise<AutumnIdentity | null>;
  };
}

interface WorkspaceEntityInput {
  workspaceId: Id<'workspaces'>;
  workspaceKey: string;
  workspaceName: string;
}

const toOptionalString = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const autumn = new Autumn(components.autumn, {
  secretKey: convexEnv.autumnApiKey,
  identify: async (ctx: AutumnIdentifyCtx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return {
      customerId: identity.subject,
      customerData: {
        name: toOptionalString(identity.name),
        email: toOptionalString(identity.email),
      },
    };
  },
});

export const toWorkspaceEntityArgs = (workspace: WorkspaceEntityInput) => ({
  entityId: workspace.workspaceId,
  entityData: {
    workspaceKey: workspace.workspaceKey,
    workspaceName: workspace.workspaceName,
  },
});

export const {
  track,
  cancel,
  query: autumnQuery,
  attach,
  check,
  checkout,
  usage,
  setupPayment,
  createCustomer,
  listProducts,
  billingPortal,
  createReferralCode,
  redeemReferralCode,
  createEntity,
  getEntity,
} = autumn.api();
