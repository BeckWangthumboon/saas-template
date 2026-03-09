import { api, type Id } from '@saas/convex-api';
import type { AppErrorData } from '@saas/shared/errors';
import { ErrorCode, parseAppError } from '@saas/shared/errors';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { format } from 'date-fns';
import { RotateCwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BillingProvider, type BillingState, useBilling } from '@/features/billing';
import {
  isWorkspaceEntitlementsReady,
  isWorkspaceReady,
  useWorkspace,
  useWorkspaceEntitlements,
} from '@/features/workspaces';
import { useConvexAction } from '@/hooks';
import { convexClient } from '@/lib/convexClient';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/w/$workspaceKey/settings/billing')({
  loader: async ({ params }): Promise<BillingState> => {
    try {
      const billing = await convexClient.action(api.billing.index.getWorkspaceBillingSummary, {
        workspaceKey: params.workspaceKey,
      });

      return {
        status: 'ready',
        billing,
      };
    } catch (error: unknown) {
      return {
        status: 'error',
        error:
          parseAppError(error) ??
          createInternalBillingError(
            error instanceof Error ? error.message : 'Unable to load billing details',
          ),
      };
    }
  },
  component: BillingSettingsPage,
});

const createInternalBillingError = (message: string): AppErrorData => ({
  code: ErrorCode.INTERNAL_ERROR,
  category: 'INTERNAL',
  message,
  timestamp: new Date().toISOString(),
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

const formatStatus = (
  value: 'none' | 'trialing' | 'active' | 'past_due' | 'scheduled' | 'expired',
) => {
  if (value === 'past_due') {
    return 'Past due';
  }

  if (value === 'none') {
    return 'No subscription';
  }

  if (value === 'scheduled') {
    return 'Scheduled';
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const getStatusClassName = (
  value: 'none' | 'trialing' | 'active' | 'past_due' | 'scheduled' | 'expired',
) => {
  if (value === 'active' || value === 'trialing') {
    return 'text-foreground';
  }

  if (value === 'past_due') {
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
  const billingState = Route.useLoaderData();

  if (!isWorkspaceReady(workspaceContext)) {
    if (workspaceContext.status === 'empty') {
      return <p className="text-muted-foreground">Workspace not found.</p>;
    }

    return <p className="text-muted-foreground">Loading workspace...</p>;
  }

  return (
    <BillingProvider role={workspaceContext.role} state={billingState}>
      <BillingSettingsContent workspaceId={workspaceContext.workspaceId as Id<'workspaces'>} />
    </BillingProvider>
  );
}

interface BillingSettingsContentProps {
  workspaceId: Id<'workspaces'>;
}

function BillingSettingsContent({ workspaceId }: BillingSettingsContentProps) {
  const entitlementsContext = useWorkspaceEntitlements();
  const { execute: checkout } = useConvexAction(api.billing.index.checkout);
  const { execute: billingPortal } = useConvexAction(api.billing.index.billingPortal);
  const router = useRouter();
  const billingState = useBilling();
  const { canManageBilling } = billingState;
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
      const result = await checkout({
        workspaceId,
        planKey,
      });

      if (result.isErr()) {
        toast.error('Failed to start checkout', {
          description: result.error.message,
        });
        return;
      }

      window.location.assign(result.value.url);
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
      const result = await billingPortal({
        workspaceId,
      });

      if (result.isErr()) {
        toast.error('Failed to open billing portal', {
          description: result.error.message,
        });
        return;
      }

      window.location.assign(result.value.url);
    } catch (error) {
      toast.error('Failed to open billing portal', {
        description: error instanceof Error ? error.message : 'Unexpected billing portal error',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleReload = () => {
    void router.invalidate();
  };

  if (billingState.status === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">{billingState.error.message}</p>
        <Button variant="outline" size="icon" onClick={handleReload} aria-label="Reload billing">
          <RotateCwIcon className="size-4" />
        </Button>
      </div>
    );
  }

  if (!isEntitlementsReady) {
    return <p className="text-muted-foreground">Loading billing...</p>;
  }

  const { billing } = billingState;
  const displayPlanKey = billing.planKey;
  const displayTier = getPlanTier(displayPlanKey);
  const displayStatus = billing.status;
  const statusClassName = getStatusClassName(displayStatus);
  const isFreeTier = displayTier === 'free';
  const billingCycleText = isFreeTier
    ? 'No billing cycle'
    : displayStatus === 'scheduled'
      ? billing.periodEnd
        ? `Scheduled for ${formatTimestamp(billing.periodEnd)}`
        : 'Scheduled'
      : displayStatus === 'expired'
        ? billing.periodEnd
          ? `Ended ${formatTimestamp(billing.periodEnd)}`
          : 'Expired'
        : billing.cancelAtPeriodEnd
          ? `Ends ${formatTimestamp(billing.periodEnd)}`
          : `Renews ${formatTimestamp(billing.periodEnd)}`;
  const {
    entitlements: { usage },
  } = entitlementsContext;

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Billing</h1>
          <p className="text-muted-foreground text-sm">Simple billing for your workspace.</p>
        </div>
        <Button variant="outline" size="icon" onClick={handleReload} aria-label="Reload billing">
          <RotateCwIcon className="size-4" />
        </Button>
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
              <span className="text-muted-foreground">Active members:</span> {usage.memberCount}
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
