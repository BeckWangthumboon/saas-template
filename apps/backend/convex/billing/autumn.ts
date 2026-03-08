import { Autumn as AutumnSdk } from 'autumn-js';

import type { Id } from '../_generated/dataModel';
import { convexEnv } from '../env';

export interface WorkspaceBillingCustomer {
  workspaceId: Id<'workspaces'>;
  workspaceKey: string;
  workspaceName: string;
}

const autumnSdk = new AutumnSdk({
  secretKey: convexEnv.autumnApiKey,
});

const toWorkspaceCustomerData = (workspace: WorkspaceBillingCustomer) => ({
  name: workspace.workspaceName,
});

export const check = (args: {
  workspace: WorkspaceBillingCustomer;
  featureId: string;
  requiredBalance?: number;
  sendEvent?: boolean;
  withPreview?: boolean;
}) =>
  autumnSdk.check({
    customer_id: args.workspace.workspaceId,
    customer_data: toWorkspaceCustomerData(args.workspace),
    feature_id: args.featureId,
    required_balance: args.requiredBalance,
    send_event: args.sendEvent,
    with_preview: args.withPreview,
  });

export const track = (args: {
  workspace: WorkspaceBillingCustomer;
  featureId?: string;
  value?: number;
  eventName?: string;
  idempotencyKey?: string;
  properties?: Record<string, unknown>;
}) =>
  autumnSdk.track({
    customer_id: args.workspace.workspaceId,
    customer_data: toWorkspaceCustomerData(args.workspace),
    feature_id: args.featureId,
    value: args.value,
    event_name: args.eventName,
    idempotency_key: args.idempotencyKey,
    properties: args.properties,
  });

export const checkout = (args: {
  workspace: WorkspaceBillingCustomer;
  productId: string;
  successUrl?: string;
}) =>
  autumnSdk.checkout({
    customer_id: args.workspace.workspaceId,
    customer_data: toWorkspaceCustomerData(args.workspace),
    product_id: args.productId,
    success_url: args.successUrl,
  });

export const billingPortal = (args: { workspace: WorkspaceBillingCustomer; returnUrl?: string }) =>
  autumnSdk.customers.billingPortal(args.workspace.workspaceId, {
    return_url: args.returnUrl,
  });
