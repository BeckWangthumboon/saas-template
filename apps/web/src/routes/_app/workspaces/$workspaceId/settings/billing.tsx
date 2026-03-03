import type { Id } from '@saas/convex-api';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';
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
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/settings/billing')({
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
      <BillingSettingsContent />
    </BillingProvider>
  );
}

function BillingSettingsContent() {
  const entitlementsContext = useWorkspaceEntitlements();
  const {
    status,
    billing,
    canManageBilling,
    checkoutState,
    portalState,
    startCheckout,
    createPortalSession,
  } = useBilling();
  const hasShownCheckoutSuccessRef = useRef(false);

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

  const isCheckoutLoading = checkoutState.status === 'loading';
  const isPortalLoading = portalState.status === 'loading';
  const isEntitlementsReady = isWorkspaceEntitlementsReady(entitlementsContext);

  const handleStartCheckout = async (planKey: 'pro_monthly' | 'pro_yearly') => {
    if (!canManageBilling) {
      toast.error('Insufficient permissions', {
        description: 'Only workspace owners and admins can manage billing.',
      });
      return;
    }

    const checkoutWindow = window.open('', '_blank');
    if (!checkoutWindow) {
      toast.error('Popup blocked', {
        description: 'Allow popups to open checkout in a new tab.',
      });
      return;
    }
    checkoutWindow.opener = null;

    const result = await startCheckout(planKey);
    if (!result.ok) {
      checkoutWindow.close();
      toast.error('Failed to start checkout', {
        description: result.error.message,
      });
      return;
    }

    checkoutWindow.location.href = result.data.url;
  };

  const handleOpenPortal = async () => {
    if (!canManageBilling) {
      toast.error('Insufficient permissions', {
        description: 'Only workspace owners and admins can manage billing.',
      });
      return;
    }

    const portalWindow = window.open('', '_blank');
    if (!portalWindow) {
      toast.error('Popup blocked', {
        description: 'Allow popups to open billing in a new tab.',
      });
      return;
    }
    portalWindow.opener = null;

    const result = await createPortalSession();
    if (!result.ok) {
      portalWindow.close();
      toast.error('Failed to open billing portal', {
        description: result.error.message,
      });
      return;
    }

    portalWindow.location.href = result.data.url;
  };

  if (status === 'loading' || !billing || !isEntitlementsReady) {
    return <p className="text-muted-foreground">Loading billing...</p>;
  }

  const entitlements = entitlementsContext.entitlements;
  const displayPlanKey = entitlements.plan.key;
  const displayTier = getPlanTier(displayPlanKey);
  const displayStatus = billing.status === 'canceled' ? 'none' : entitlements.lifecycle.status;
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

          {entitlements.lifecycle.isInGrace && (
            <p className="text-muted-foreground text-sm">
              Payment issue detected: Your access will be revoked at:{' '}
              {formatTimestamp(entitlements.lifecycle.graceEndsAt)}.
            </p>
          )}
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
