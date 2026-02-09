import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BillingProvider, useBilling } from '@/features/billing';
import { isWorkspaceReady, useWorkspace } from '@/features/workspaces';

import type { Id } from '../../../../../../convex/_generated/dataModel';

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

const formatStatus = (value: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled') => {
  if (value === 'past_due') {
    return 'Past due';
  }

  if (value === 'none') {
    return 'No subscription';
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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

  const handleStartCheckout = async (planKey: 'pro_monthly' | 'pro_yearly') => {
    if (!canManageBilling) {
      toast.error('Insufficient permissions', {
        description: 'Only workspace owners and admins can manage billing.',
      });
      return;
    }

    const result = await startCheckout(planKey);
    if (!result.ok) {
      toast.error('Failed to start checkout', {
        description: result.error.message,
      });
      return;
    }

    window.location.href = result.data.url;
  };

  const handleOpenPortal = async () => {
    if (!canManageBilling) {
      toast.error('Insufficient permissions', {
        description: 'Only workspace owners and admins can manage billing.',
      });
      return;
    }

    const result = await createPortalSession();
    if (!result.ok) {
      toast.error('Failed to open billing portal', {
        description: result.error.message,
      });
      return;
    }

    window.location.href = result.data.url;
  };

  if (status === 'loading' || !billing) {
    return <p className="text-muted-foreground">Loading billing...</p>;
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Review your current plan and manage checkout for this workspace.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Current Plan</h2>
          <Badge variant={billing.tier === 'pro' ? 'default' : 'secondary'}>
            {formatPlanKey(billing.planKey)}
          </Badge>
        </div>

        <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Subscription status:</span>{' '}
            {formatStatus(billing.status)}
          </p>
          <p>
            <span className="text-muted-foreground">Effective status:</span>{' '}
            {formatStatus(billing.effectiveStatus)}
          </p>
          <p>
            <span className="text-muted-foreground">Current period ends:</span>{' '}
            {formatTimestamp(billing.periodEnd)}
          </p>
          <p>
            <span className="text-muted-foreground">Cancel at period end:</span>{' '}
            {billing.cancelAtPeriodEnd ? 'Yes' : 'No'}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Manage Billing</h2>
        <p className="text-muted-foreground text-sm">
          Choose a plan checkout or open the billing portal to manage your subscription.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              void handleStartCheckout('pro_monthly');
            }}
            disabled={isCheckoutLoading || isPortalLoading || !canManageBilling}
          >
            {isCheckoutLoading ? 'Redirecting...' : 'Checkout Pro Monthly'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void handleStartCheckout('pro_yearly');
            }}
            disabled={isCheckoutLoading || isPortalLoading || !canManageBilling}
          >
            {isCheckoutLoading ? 'Redirecting...' : 'Checkout Pro Yearly'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void handleOpenPortal();
            }}
            disabled={isCheckoutLoading || isPortalLoading || !canManageBilling}
          >
            {isPortalLoading ? 'Opening...' : 'Manage in Billing Portal'}
          </Button>
        </div>

        {!canManageBilling && (
          <p className="text-muted-foreground text-sm">
            You can view billing details, but only workspace owners and admins can manage billing.
          </p>
        )}
      </section>
    </div>
  );
}
