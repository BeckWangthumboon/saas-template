import { api, type Id } from '@saas/convex-api';
import { AUTUMN_PLAN_IDS } from '@saas/shared/billing/ids';
import { createFileRoute } from '@tanstack/react-router';
import { useCustomer } from 'autumn-js/react';
import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BillingProvider, useBilling } from '@/features/billing';
import {
  isWorkspaceEntitlementsReady,
  isWorkspaceReady,
  useWorkspace,
  useWorkspaceEntitlements,
} from '@/features/workspaces';
import { useConvexAction } from '@/hooks';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/w/$workspaceKey/settings/billing')({
  component: BillingSettingsPage,
});

const formatPlanKey = (planKey: 'free' | 'pro_monthly' | 'pro_yearly') => {
  switch (planKey) {
    case 'free':
      return 'Free';
    case 'pro_monthly':
      return 'Pro Monthly';
    case 'pro_yearly':
      return 'Pro Yearly';
  }
};

const getPlanTier = (planKey: 'free' | 'pro_monthly' | 'pro_yearly') =>
  planKey === 'free' ? 'free' : 'pro';

const formatStatus = (value: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled') => {
  if (value === 'past_due') {
    return 'Past due';
  }

  if (value === 'none') {
    return 'No subscription';
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const getStatusClassName = (value: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled') => {
  if (value === 'active' || value === 'trialing') {
    return 'text-foreground';
  }

  if (value === 'past_due' || value === 'canceled') {
    return 'text-destructive';
  }

  return 'text-muted-foreground';
};

const formatTimestamp = (timestamp: number | undefined) => {
  if (!timestamp) {
    return 'N/A';
  }

  return format(new Date(timestamp), 'MMM d, yyyy');
};

function BillingSettingsPage() {
  const workspaceContext = useWorkspace();

  if (!isWorkspaceReady(workspaceContext)) {
    if (workspaceContext.status === 'empty') {
      return <p className="text-muted-foreground">Workspace not found.</p>;
    }

    return <p className="text-muted-foreground">Loading workspace...</p>;
  }

  return (
    <BillingProvider
      workspaceId={workspaceContext.workspaceId as Id<'workspaces'>}
      role={workspaceContext.role}
    >
      <BillingSettingsContent
        workspaceId={workspaceContext.workspaceId as Id<'workspaces'>}
        billingPath={workspaceContext.getWorkspacePath('/settings/billing')}
      />
    </BillingProvider>
  );
}

interface BillingSettingsContentProps {
  workspaceId: Id<'workspaces'>;
  billingPath: string;
}

function BillingSettingsContent({ workspaceId, billingPath }: BillingSettingsContentProps) {
  const entitlementsContext = useWorkspaceEntitlements();
  const { checkout, openBillingPortal } = useCustomer();
  const { execute: ensureWorkspaceBillingEntity } = useConvexAction(
    api.billing.index.ensureWorkspaceBillingEntity,
  );
  const { status, billing, canManageBilling } = useBilling();
  const hasShownCheckoutSuccessRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<
    'checkout_monthly' | 'checkout_yearly' | 'portal' | null
  >(null);

  useEffect(() => {
    if (hasShownCheckoutSuccessRef.current) {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('checkout') !== 'success') {
      return;
    }

    toast.success('Checkout completed', {
      description: 'Your billing details will update shortly after webhook processing.',
    });
    hasShownCheckoutSuccessRef.current = true;
  }, []);

  const isCheckoutLoading =
    pendingAction === 'checkout_monthly' || pendingAction === 'checkout_yearly';
  const isPortalLoading = pendingAction === 'portal';
  const isEntitlementsReady = isWorkspaceEntitlementsReady(entitlementsContext);

  const handleStartCheckout = async (planKey: 'pro_monthly' | 'pro_yearly') => {
    if (!canManageBilling) {
      toast.error('Insufficient permissions', {
        description: 'Only workspace owners and admins can manage billing.',
      });
      return;
    }

    setPendingAction(planKey === 'pro_monthly' ? 'checkout_monthly' : 'checkout_yearly');

    try {
      const ensureResult = await ensureWorkspaceBillingEntity({ workspaceId });
      if (ensureResult.isErr()) {
        toast.error('Failed to prepare checkout', {
          description: ensureResult.error.message,
        });
        return;
      }

      const autumnPlanId =
        planKey === 'pro_monthly' ? AUTUMN_PLAN_IDS.proMonthly : AUTUMN_PLAN_IDS.proYearly;

      const result = await checkout({
        productId: autumnPlanId,
        entityId: workspaceId,
        successUrl: `${window.location.origin}${billingPath}?checkout=success`,
        openInNewTab: true,
      });

      if (result.error) {
        toast.error('Failed to start checkout', {
          description: result.error.message,
        });
      }
    } catch (error) {
      toast.error('Failed to start checkout', {
        description: error instanceof Error ? error.message : 'Unexpected checkout error',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleOpenPortal = async () => {
    if (!canManageBilling) {
      toast.error('Insufficient permissions', {
        description: 'Only workspace owners and admins can manage billing.',
      });
      return;
    }

    setPendingAction('portal');

    try {
      const result = await openBillingPortal({
        returnUrl: `${window.location.origin}${billingPath}`,
        openInNewTab: true,
      });

      if (result.error) {
        toast.error('Failed to open billing portal', {
          description: result.error.message,
        });
      }
    } catch (error) {
      toast.error('Failed to open billing portal', {
        description: error instanceof Error ? error.message : 'Unexpected billing portal error',
      });
    } finally {
      setPendingAction(null);
    }
  };

  if (status === 'loading' || !billing || !isEntitlementsReady) {
    return <p className="text-muted-foreground">Loading billing...</p>;
  }

  const entitlements = entitlementsContext.entitlements;
  const displayPlanKey = entitlements.plan.key;
  const displayTier = getPlanTier(displayPlanKey);
  const displayStatus = billing.status === 'canceled' ? 'none' : billing.status;
  const statusClassName = getStatusClassName(displayStatus);
  const isFreeTier = displayTier === 'free';
  const billingCycleText = isFreeTier
    ? 'No billing cycle'
    : billing.cancelAtPeriodEnd
      ? `Ends ${formatTimestamp(billing.periodEnd)}`
      : `Renews ${formatTimestamp(billing.periodEnd)}`;
  const membersLimitText =
    entitlements.limits.members === null ? 'Unlimited' : String(entitlements.limits.members);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-muted-foreground text-sm">Simple billing for your workspace.</p>
      </div>

      <section className="space-y-6 rounded-xl border bg-card p-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Plan</h2>
            <Badge variant={displayTier === 'pro' ? 'default' : 'secondary'}>
              {formatPlanKey(displayPlanKey)}
            </Badge>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Status:</span>{' '}
              <span className={cn('font-medium', statusClassName)}>
                {formatStatus(displayStatus)}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Billing cycle:</span> {billingCycleText}
            </p>
            <p>
              <span className="text-muted-foreground">Members:</span>{' '}
              {entitlements.usage.memberCount} / {membersLimitText}
            </p>
          </div>
        </div>

        {canManageBilling && (
          <div className="space-y-4 border-t pt-6">
            <div>
              <h2 className="text-lg font-medium">Manage</h2>
            </div>

            {isFreeTier ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    void handleStartCheckout('pro_monthly');
                  }}
                  disabled={isCheckoutLoading || isPortalLoading}
                >
                  {isCheckoutLoading ? 'Opening checkout...' : 'Upgrade to Pro Monthly'}
                </Button>
                <Button
                  onClick={() => {
                    void handleStartCheckout('pro_yearly');
                  }}
                  disabled={isCheckoutLoading || isPortalLoading}
                >
                  {isCheckoutLoading ? 'Opening checkout...' : 'Upgrade to Pro Yearly'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    void handleOpenPortal();
                  }}
                  disabled={isCheckoutLoading || isPortalLoading}
                >
                  {isPortalLoading ? 'Opening...' : 'Manage billing'}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
