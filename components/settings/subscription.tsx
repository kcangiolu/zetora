'use client';

import type { SettingsUser } from './shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { Dialog } from '@/components/ui/dialog';

import { useMediaQuery } from '@/hooks/use-media-query';

import { authClient, betterauthClient } from '@/lib/auth-client';
import { all } from 'better-all';

import {
  ExternalLink,
  Check,
  X,
  AlertCircle,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { sileo } from 'sileo';
import { useQuery } from '@tanstack/react-query';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Crown02Icon } from '@hugeicons/core-free-icons';

// Custom visx-based chart components

export function SubscriptionSection({
  subscriptionData,
  isProUser,
  user,
}: {
  // Legacy Polar/Dodo payload shape — untyped upstream (see UserContextType.subscriptionData).
  subscriptionData: any;
  isProUser: boolean;
  user: SettingsUser;
}) {
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Use data from user object (already cached)
  // Not part of ComprehensiveUserData — legacy field, always undefined; kept as-is.
  const dodoProStatus = (user as any)?.dodoProStatus || null;

  // Fetch Polar orders using React Query
  const { data: polarOrders, isLoading: polarOrdersLoading } = useQuery({
    queryKey: ['polarOrders', user?.id],
    queryFn: async () => {
      try {
        const ordersResponse = await authClient.customer.orders.list({
          fetchOptions: {
            query: {
              page: 1,
              limit: 10,
            },
          },
        });
        return ordersResponse.data;
      } catch (error) {
        console.log('Failed to fetch Polar orders:', error);
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Fetch Dodo subscriptions using React Query
  const { data: dodoSubscriptions, isLoading: dodoSubscriptionsLoading } = useQuery({
    queryKey: ['dodoSubscriptions', user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await betterauthClient.dodopayments.customer.subscriptions.list();
        if (error) {
          console.log('Failed to fetch Dodo subscriptions:', error);
          return null;
        }
        console.log('Dodo subscriptions response:', data);
        return data;
      } catch (error) {
        console.log('Failed to fetch Dodo subscriptions:', error);
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Get the most recent active dodo subscription for pricing info
  const activeDodoSub =
    user?.subscriptionHistory?.find((sub: any) => sub.status === 'active') || user?.subscriptionHistory?.[0];

  // Normalize dodo subscriptions: prefer live API data, fall back to DB subscription history
  const dodoApiList: any[] = dodoSubscriptions
    ? Array.isArray(dodoSubscriptions)
      ? dodoSubscriptions
      : dodoSubscriptions.items || []
    : [];
  const dodoList: any[] =
    dodoApiList.length > 0
      ? dodoApiList
      : (user?.subscriptionHistory || []).map((sub: any) => ({
          id: sub.id,
          created_at: sub.createdAt,
          currency: sub.currency,
          recurring_pre_tax_amount: sub.amount,
          status: sub.status,
        }));
  const polarList: any[] = getPolarOrders(polarOrders);
  const polarFallback = getPolarFallbackOrders(user);
  const polarHistory = polarList.length > 0 ? polarList : polarFallback;
  const hasAnyBillingHistory = dodoList.length > 0 || polarHistory.length > 0;

  // Format currency amount from smallest unit (cents/paise) to display string
  const formatSubAmount = (amount: number, currency: string) => {
    const code = currency?.toUpperCase() || 'USD';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount / 100);
    } catch {
      return `${(amount / 100).toFixed(2)} ${code}`;
    }
  };

  function getPolarOrders(orders: any): any[] {
    if (!orders) return [];
    if (Array.isArray(orders)) return orders;
    if (Array.isArray(orders.items)) return orders.items;
    if (Array.isArray(orders.result?.items)) return orders.result.items;
    if (Array.isArray(orders.data?.items)) return orders.data.items;
    return [];
  }

  function getPolarFallbackOrders(currentUser: any): any[] {
    const subscription = currentUser?.polarSubscription;
    if (!subscription) return [];
    const createdAt =
      subscription.currentPeriodStart ||
      subscription.createdAt ||
      subscription.current_period_start ||
      subscription.created_at ||
      null;
    return [
      {
        id: subscription.id || `polar-sub-${currentUser?.id || 'current'}`,
        createdAt,
        totalAmount: subscription.amount,
        currency: subscription.currency,
        status: subscription.status,
        product: {
          name: 'Zetora Pro',
        },
      },
    ];
  }

  function getPolarOrderDate(order: any): Date | null {
    const value = order?.createdAt ?? order?.created_at ?? order?.created;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getPolarOrderAmount(order: any): number | null {
    const value = order?.totalAmount ?? order?.total_amount ?? order?.amount_total ?? order?.amount ?? order?.total;
    return typeof value === 'number' ? value : null;
  }

  function getPolarOrderCurrency(order: any): string {
    return (order?.currency ?? order?.currency_code ?? order?.currencyCode ?? 'USD').toString();
  }

  function getPolarOrderTitle(order: any): string {
    return order?.product?.name ?? order?.product?.title ?? order?.product_name ?? order?.name ?? 'Subscription';
  }

  function getPolarOrderStatus(order: any): string {
    return (order?.status ?? order?.payment_status ?? 'recurring').toString().replace(/_/g, ' ');
  }

  const handleManageSubscription = async () => {
    // Determine the subscription source
    const getProAccessSource = () => {
      if (hasActiveSubscription) return 'polar';
      if (hasDodoProStatus) return 'dodo';
      return null;
    };

    const proSource = getProAccessSource();

    console.log('proSource', proSource);

    try {
      setIsManagingSubscription(true);

      console.log('Settings Dialog - Provider source:', proSource);
      console.log('User dodoProStatus:', (user as any)?.dodoProStatus);
      console.log('User full object keys:', Object.keys(user || {}));

      if (proSource === 'dodo') {
        // Use DodoPayments portal for DodoPayments users
        console.log('Opening DodoPayments portal');
        console.log('User object for DodoPayments:', {
          id: user?.id,
          email: user?.email,
          dodoProStatus: (user as any)?.dodoProStatus,
          isProUser: user?.isProUser,
        });
        await betterauthClient.dodopayments.customer.portal();
      } else {
        // Use Polar portal for Polar subscribers
        console.log('Opening Polar portal');
        await authClient.customer.portal({});
      }
    } catch (error) {
      console.error('Subscription management error:', error);

      if (proSource === 'dodo') {
        sileo.error({
          title: 'Unable to access DodoPayments portal',
          description: 'Please contact support at kenny@flowinit.fr',
          icon: <AlertCircle className="h-4 w-4" />,
        });
      } else {
        sileo.error({
          title: 'Failed to open subscription management',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } finally {
      setIsManagingSubscription(false);
    }
  };

  // Check for active status from either source
  const hasActiveSubscription =
    subscriptionData?.hasSubscription && subscriptionData?.subscription?.status === 'active';
  const hasDodoProStatus = dodoProStatus?.isProUser || (user?.proSource === 'dodo' && user?.isProUser);
  const isProUserActive = hasActiveSubscription || hasDodoProStatus;
  const subscription = subscriptionData?.subscription;

  // Check if DodoPayments Pro is expiring soon (within 7 days)
  const getDaysUntilExpiration = () => {
    if (!dodoProStatus?.expiresAt) return null;
    const now = new Date();
    const expiresAt = new Date(dodoProStatus.expiresAt);
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntilExpiration = getDaysUntilExpiration();
  const isExpiringSoon = daysUntilExpiration !== null && daysUntilExpiration <= 7 && daysUntilExpiration > 0;

  return (
    <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
      {isProUserActive ? (
        <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
          <div className={cn('bg-primary text-primary-foreground rounded-xl', isMobile ? 'p-4' : 'p-5')}>
            <div className={cn('flex items-start justify-between', isMobile ? 'mb-3' : 'mb-4')}>
              <div className="flex items-center gap-2.5">
                <div className={cn('bg-primary-foreground/15 rounded-lg', isMobile ? 'p-1.5' : 'p-2')}>
                  <HugeiconsIcon icon={Crown02Icon} size={isMobile ? 16 : 18} color="currentColor" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className={cn('font-semibold', isMobile ? 'text-sm' : 'text-base')}>
                    Zetora{' '}
                    <span className="font-pixel text-xs uppercase tracking-wider">
                      {user?.isMaxUser ? 'Max' : 'Pro'}
                    </span>
                  </h3>
                  <p className={cn('opacity-80', isMobile ? 'text-[10px]' : 'text-xs')}>
                    {hasActiveSubscription
                      ? subscription?.status === 'active'
                        ? 'Active subscription'
                        : subscription?.status || 'Unknown'
                      : 'Active membership'}
                  </p>
                </div>
              </div>
              <span className="font-pixel text-[11px] bg-primary-foreground/15 text-primary-foreground px-2 py-1 rounded-md uppercase tracking-wider">
                Active
              </span>
            </div>
            <div className={cn('opacity-90 mb-4', isMobile ? 'text-[11px]' : 'text-xs')}>
              <p className="mb-1.5">Unlimited access to all premium features</p>
              {hasActiveSubscription && subscription && (
                <div className="flex gap-4 text-[10px] opacity-75">
                  <span>
                    ${(subscription.amount / 100).toFixed(2)}/{subscription.recurringInterval}
                  </span>
                  <span>Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
                </div>
              )}
              {hasDodoProStatus && !hasActiveSubscription && (
                <div className="space-y-1">
                  <div className="flex gap-4 text-[10px] opacity-75">
                    <span>
                      {activeDodoSub
                        ? `${formatSubAmount(activeDodoSub.amount, activeDodoSub.currency)}/${activeDodoSub.interval?.toLowerCase() || 'month'}`
                        : 'Pro subscription'}{' '}
                      (auto-renews)
                    </span>
                  </div>
                  {dodoProStatus?.expiresAt && (
                    <div className="text-[10px] opacity-75">
                      <span>Next billing: {new Date(dodoProStatus.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {(hasActiveSubscription || hasDodoProStatus) && (
              <Button
                variant="secondary"
                onClick={handleManageSubscription}
                className={cn('w-full rounded-lg', isMobile ? 'h-8 text-xs' : 'h-9')}
                disabled={isManagingSubscription}
              >
                {isManagingSubscription ? (
                  <Loader2 className={isMobile ? 'h-3 w-3 mr-1.5' : 'h-3.5 w-3.5 mr-2'} />
                ) : (
                  <ExternalLink className={isMobile ? 'h-3 w-3 mr-1.5' : 'h-3.5 w-3.5 mr-2'} />
                )}
                {isManagingSubscription ? 'Opening...' : 'Manage Billing'}
              </Button>
            )}
          </div>

          {/* Expiration Warning for DodoPayments */}
          {isExpiringSoon && (
            <div
              className={cn(
                'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg',
                isMobile ? 'p-3' : 'p-4',
              )}
            >
              <div className="flex items-start gap-2">
                <div className={cn('bg-yellow-100 dark:bg-yellow-900/40 rounded', isMobile ? 'p-1' : 'p-1.5')}>
                  <HugeiconsIcon
                    icon={Crown02Icon}
                    size={isMobile ? 14 : 16}
                    color="currentColor"
                    strokeWidth={1.5}
                    className={cn('text-yellow-600 dark:text-yellow-500')}
                  />
                </div>
                <div className="flex-1">
                  <h4
                    className={cn(
                      'font-semibold text-yellow-800 dark:text-yellow-200',
                      isMobile ? 'text-xs' : 'text-sm',
                    )}
                  >
                    Pro Access Expiring Soon
                  </h4>
                  <p
                    className={cn(
                      'text-yellow-700 dark:text-yellow-300',
                      isMobile ? 'text-[11px] mt-1' : 'text-xs mt-1',
                    )}
                  >
                    Your Pro access expires in {daysUntilExpiration} {daysUntilExpiration === 1 ? 'day' : 'days'}. Renew
                    now to continue enjoying unlimited features.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className={cn(
                      'mt-2 bg-yellow-600 hover:bg-yellow-700 text-white',
                      isMobile ? 'h-7 text-xs' : 'h-8',
                    )}
                  >
                    <Link href="/pricing">Renew Pro Access</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
          <div
            className={cn(
              'text-center border border-dashed border-border/60 rounded-xl bg-muted/10',
              isMobile ? 'p-5' : 'p-8',
            )}
          >
            <div className="mx-auto w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
              <HugeiconsIcon
                icon={Crown02Icon}
                size={24}
                color="currentColor"
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </div>
            <h3 className={cn('font-semibold mb-1', isMobile ? 'text-sm' : 'text-base')}>No Active Plan</h3>
            <p className={cn('text-muted-foreground mb-5', isMobile ? 'text-[11px]' : 'text-xs')}>
              Upgrade to <span className="font-pixel text-xs uppercase tracking-wider">Pro</span> for unlimited access
            </p>
            <div className="space-y-2 max-w-xs mx-auto">
              <Button asChild size="sm" className={cn('w-full rounded-lg', isMobile ? 'h-9 text-xs' : 'h-10')}>
                <Link href="/pricing">
                  <HugeiconsIcon
                    icon={Crown02Icon}
                    size={isMobile ? 12 : 14}
                    color="currentColor"
                    strokeWidth={1.5}
                    className={isMobile ? 'mr-1.5' : 'mr-2'}
                  />
                  Upgrade to Pro
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn('w-full rounded-lg', isMobile ? 'h-8 text-xs' : 'h-9')}
              >
                <Link href="/pricing">Compare Plans</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
        <div className="flex items-center gap-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">02</span>
          <h4 className={cn('font-semibold', isMobile ? 'text-xs' : 'text-sm')}>Billing History</h4>
        </div>
        {polarOrdersLoading || dodoSubscriptionsLoading ? (
          <div className={cn('border rounded-lg flex items-center justify-center', isMobile ? 'p-3 h-16' : 'p-4 h-20')}>
            <Loader2 className={cn(isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4', 'animate-spin')} />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Show Dodo subscriptions */}
            {dodoList.length > 0 && (
              <>
                {dodoList.slice(0, 3).map((subscription: any) => (
                  <div key={subscription.id} className={cn('bg-muted/30 rounded-lg', isMobile ? 'p-2.5' : 'p-3')}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className={cn('font-medium truncate', isMobile ? 'text-xs' : 'text-sm')}>
                          Zetora Pro (DodoPayments)
                        </p>
                        <div className="flex items-center gap-2">
                          <p className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                            {new Date(subscription.created_at).toLocaleDateString()}
                          </p>
                          <Badge variant="secondary" className="text-[8px] px-1 py-0">
                            {subscription.currency?.toUpperCase() || 'USD'}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn('font-semibold block', isMobile ? 'text-xs' : 'text-sm')}>
                          {subscription.recurring_pre_tax_amount
                            ? formatSubAmount(subscription.recurring_pre_tax_amount, subscription.currency || 'USD')
                            : '—'}
                        </span>
                        <span className={cn('text-muted-foreground', isMobile ? 'text-[9px]' : 'text-xs')}>
                          {subscription.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Show Polar orders */}
            {polarHistory.length > 0 && (
              <>
                {polarHistory.slice(0, 3).map((order: any) => {
                  const orderDate = getPolarOrderDate(order);
                  const orderAmount = getPolarOrderAmount(order);
                  const orderCurrency = getPolarOrderCurrency(order);
                  return (
                    <div key={order.id} className={cn('bg-muted/30 rounded-lg', isMobile ? 'p-2.5' : 'p-3')}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-medium truncate', isMobile ? 'text-xs' : 'text-sm')}>
                            {getPolarOrderTitle(order)}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                              {orderDate ? orderDate.toLocaleDateString() : '—'}
                            </p>
                            <Badge variant="secondary" className="text-[8px] px-1 py-0">
                              {orderCurrency.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={cn('font-semibold block', isMobile ? 'text-xs' : 'text-sm')}>
                            {orderAmount !== null ? formatSubAmount(orderAmount, orderCurrency) : '—'}
                          </span>
                          <span className={cn('text-muted-foreground', isMobile ? 'text-[9px]' : 'text-xs')}>
                            {getPolarOrderStatus(order)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Show message if no billing history */}
            {!hasAnyBillingHistory && (
              <div
                className={cn(
                  'border rounded-lg text-center bg-muted/20 flex items-center justify-center',
                  isMobile ? 'p-4 h-16' : 'p-6 h-20',
                )}
              >
                <p className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-xs')}>
                  No billing history yet
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Uploads ────────────────────────────────────────────────────────────────
