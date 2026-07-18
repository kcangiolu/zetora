'use client';

import type { SettingsUser } from './shared';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

import { Progress } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';

import { useMediaQuery } from '@/hooks/use-media-query';

import {
  getUserMessageCount,
  getSubDetails,
  getExtremeSearchUsageCount,
  getAgentModeUsageCountAction,
  getAnthropicUsageCountAction,
  getGoogleUsageCountAction,
  getHistoricalUsage,
} from '@/app/actions';
import { AGENT_MODE_MONTHLY_LIMIT, SEARCH_LIMITS } from '@/lib/constants';

import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { MagnifyingGlassIcon, LightningIcon, ArrowClockwiseIcon, RobotIcon } from '@phosphor-icons/react';

import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo } from 'react';

import { sileo } from 'sileo';
import { useQuery } from '@tanstack/react-query';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

// Custom visx-based chart components
import { AreaChart as CustomAreaChart } from '@/components/charts/area-chart';
import { Area as CustomArea } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip as CustomChartTooltip } from '@/components/charts/tooltip';
import type { TooltipRow } from '@/components/charts/tooltip/tooltip-content';

// Component for Usage Information
type TimePeriod = '7d' | '30d' | '12m';

export function UsageSection({ user }: { user: SettingsUser }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7d');

  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
  const isProUser = user?.isProUser;

  // Convert time period to days
  const daysWindow = useMemo(() => {
    switch (timePeriod) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '12m':
        return 365; // 12 months
      default:
        return 7;
    }
  }, [timePeriod]);

  const {
    data: usageData,
    isLoading: usageLoading,
    error: usageError,
    refetch: refetchUsageData,
  } = useQuery({
    queryKey: ['usageData'],
    queryFn: async () => {
      const {
        searchCount,
        extremeSearchCount,
        agentModeUsageCount,
        anthropicUsageCount,
        googleUsageCount,
        subscriptionDetails,
      } = await all(
        {
          async searchCount() {
            return getUserMessageCount();
          },
          async extremeSearchCount() {
            return getExtremeSearchUsageCount();
          },
          async agentModeUsageCount() {
            return getAgentModeUsageCountAction();
          },
          async anthropicUsageCount() {
            return getAnthropicUsageCountAction();
          },
          async googleUsageCount() {
            return getGoogleUsageCountAction();
          },
          async subscriptionDetails() {
            return getSubDetails();
          },
        },
        getBetterAllOptions(),
      );

      return {
        searchCount,
        extremeSearchCount,
        agentModeUsageCount,
        anthropicUsageCount,
        googleUsageCount,
        subscriptionDetails,
      };
    },
    staleTime: 1000 * 60 * 3,
    enabled: !!user,
  });

  const {
    data: historicalUsageData,
    isLoading: historicalLoading,
    refetch: refetchHistoricalData,
  } = useQuery({
    queryKey: ['historicalUsage', user?.id, daysWindow],
    queryFn: () => getHistoricalUsage(user, daysWindow),
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  const searchCount = usageData?.searchCount;
  const extremeSearchCount = usageData?.extremeSearchCount;
  const agentModeUsageCount = usageData?.agentModeUsageCount;
  const anthropicUsageCount = usageData?.anthropicUsageCount;
  const googleUsageCount = usageData?.googleUsageCount;

  // Transform historical data for chart (Date objects for visx)
  const chartData = useMemo(() => {
    if (!historicalUsageData || historicalUsageData.length === 0) return [];

    // For 12m, group by week; for others, use daily data
    if (timePeriod === '12m') {
      // Group by week for 12 months view
      const weeklyData = new Map<string, { total: number; count: number }>();

      historicalUsageData.forEach((item) => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        const weekKey = weekStart.toISOString().split('T')[0];

        const existing = weeklyData.get(weekKey) || { total: 0, count: 0 };
        weeklyData.set(weekKey, {
          total: existing.total + item.count,
          count: existing.count + 1,
        });
      });

      return Array.from(weeklyData.entries())
        .map(([dateStr, data]) => ({
          date: new Date(dateStr),
          messages: data.total,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    } else {
      // Use daily data for 7d and 30d
      return historicalUsageData
        .map((item) => ({
          date: new Date(item.date),
          messages: item.count,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }
  }, [historicalUsageData, timePeriod]);

  const handleRefreshUsage = async () => {
    try {
      setIsRefreshing(true);
      await all(
        {
          async usage() {
            return refetchUsageData();
          },
          async historical() {
            return refetchHistoricalData();
          },
        },
        getBetterAllOptions(),
      );
      sileo.success({
        title: 'Usage data refreshed',
        description: 'Your usage statistics are up to date',
        icon: <Check className="h-4 w-4" />,
      });
    } catch (error) {
      sileo.error({
        title: 'Failed to refresh usage data',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const usagePercentage = isProUser
    ? 0
    : Math.min(((searchCount?.count || 0) / SEARCH_LIMITS.DAILY_SEARCH_LIMIT) * 100, 100);

  const extremePercentage = isProUser
    ? 0
    : Math.min(((extremeSearchCount?.count || 0) / SEARCH_LIMITS.EXTREME_SEARCH_LIMIT) * 100, 100);

  const anthropicPercentage = user?.isMaxUser ? Math.min(((anthropicUsageCount?.count || 0) / 60) * 100, 100) : 0;
  const googlePercentage = user?.isMaxUser ? Math.min(((googleUsageCount?.count || 0) / 80) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      {/* Stat cards + limits in one card */}
      <div className="rounded-xl border border-border/60 divide-y divide-border/40">
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs text-muted-foreground font-medium">Today&apos;s Usage</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshUsage}
            disabled={isRefreshing}
            className="h-6 w-6 p-0 rounded-md"
          >
            {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowClockwiseIcon className="h-3 w-3" />}
          </Button>
        </div>

        {/* Stat row: searches + extreme + anthropic + google */}
        <div className={cn('divide-border/40', user?.isMaxUser ? 'grid grid-cols-4' : 'grid grid-cols-2')}>
          <div className="px-4 py-3 border-r border-border/40">
            <div className="flex items-center gap-1.5 mb-1">
              <MagnifyingGlassIcon className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground">Searches</span>
            </div>
            {usageLoading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums">{searchCount?.count || 0}</span>
                {!isProUser && (
                  <span className="text-[10px] text-muted-foreground">/ {SEARCH_LIMITS.DAILY_SEARCH_LIMIT}</span>
                )}
              </div>
            )}
          </div>
          <div className={cn('px-4 py-3', user?.isMaxUser && 'border-r border-border/40')}>
            <div className="flex items-center gap-1.5 mb-1">
              <LightningIcon className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground">Extreme</span>
            </div>
            {usageLoading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums">{extremeSearchCount?.count || 0}</span>
                {!isProUser && (
                  <span className="text-[10px] text-muted-foreground">/ {SEARCH_LIMITS.EXTREME_SEARCH_LIMIT} mo</span>
                )}
              </div>
            )}
          </div>
          {user?.isMaxUser && (
            <div className="px-4 py-3 border-r border-border/40">
              <div className="flex items-center gap-1.5 mb-1">
                <RobotIcon className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground">Anthropic</span>
              </div>
              {usageLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums">{anthropicUsageCount?.count || 0}</span>
                  <span className="text-[10px] text-muted-foreground">/ 60 wk</span>
                </div>
              )}
            </div>
          )}
          {user?.isMaxUser && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <RobotIcon className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground">Gemini</span>
              </div>
              {usageLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums">{googleUsageCount?.count || 0}</span>
                  <span className="text-[10px] text-muted-foreground">/ 80 mo</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Limit bars */}
        {!usageLoading && ((!isProUser && !user?.isMaxUser) || user?.isMaxUser) && (
          <div className="px-4 py-3 space-y-3">
            {!isProUser && !user?.isMaxUser && (
              <>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Daily limit</span>
                    <span className="text-muted-foreground tabular-nums">
                      {Math.max(0, SEARCH_LIMITS.DAILY_SEARCH_LIMIT - (searchCount?.count || 0))} left
                    </span>
                  </div>
                  <Progress value={usagePercentage} className="h-1 [&>div]:transition-none" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Monthly extreme</span>
                    <span className="text-muted-foreground tabular-nums">
                      {Math.max(0, SEARCH_LIMITS.EXTREME_SEARCH_LIMIT - (extremeSearchCount?.count || 0))} left
                    </span>
                  </div>
                  <Progress value={extremePercentage} className="h-1 [&>div]:transition-none" />
                </div>
              </>
            )}

            {user?.isMaxUser && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Anthropic weekly limit</span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.max(0, 60 - (anthropicUsageCount?.count || 0))} left
                  </span>
                </div>
                <Progress value={anthropicPercentage} className="h-1 [&>div]:transition-none" />
                <div className="flex justify-between text-[11px] pt-1">
                  <span className="text-muted-foreground">Gemini monthly limit</span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.max(0, 80 - (googleUsageCount?.count || 0))} left
                  </span>
                </div>
                <Progress value={googlePercentage} className="h-1 [&>div]:transition-none" />

                {/* Agent mode monthly limit — hidden for now
                {(() => {
                  const agentUsed = agentModeUsageCount?.count || 0;
                  const agentLeft = Math.max(0, AGENT_MODE_MONTHLY_LIMIT - agentUsed);
                  const dangerThreshold = 10;
                  const warningThreshold = 25;
                  const ringColor: 'primary' | 'warning' | 'success' | 'danger' =
                    agentLeft <= dangerThreshold
                      ? 'danger'
                      : agentLeft <= warningThreshold
                        ? 'warning'
                        : 'success';

                  return (
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-muted-foreground">Agent mode monthly limit</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{agentLeft} left</span>
                      </div>

                      <div className="flex items-center justify-center">
                        <ProgressRing
                          value={agentUsed}
                          max={AGENT_MODE_MONTHLY_LIMIT}
                          size={56}
                          strokeWidth={5}
                          showLabel
                          label={`${agentLeft} left`}
                          color={ringColor}
                        />
                      </div>
                    </div>
                  );
                })()} */}
              </div>
            )}
          </div>
        )}

        {/* Upgrade CTA (free users only) */}
        {!isProUser && (
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium">Unlimited searches</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Upgrade to remove all limits</p>
            </div>
            <Button asChild size="sm" className="h-7 text-xs rounded-lg px-3 shrink-0">
              <Link href="/pricing">Upgrade</Link>
            </Button>
          </div>
        )}
      </div>

      {!usageLoading && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {/* Activity header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
            <p className="text-xs text-muted-foreground font-medium">Activity</p>
            <ButtonGroup orientation="horizontal" className="h-6">
              <Button
                variant={timePeriod === '7d' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('7d')}
                className="h-6 px-2 text-[10px]"
              >
                7d
              </Button>
              <Button
                variant={timePeriod === '30d' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('30d')}
                className="h-6 px-2 text-[10px]"
              >
                30d
              </Button>
              <Button
                variant={timePeriod === '12m' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('12m')}
                className="h-6 px-2 text-[10px]"
              >
                12m
              </Button>
            </ButtonGroup>
          </div>
          {/* Chart */}
          <div className="p-3">
            {historicalLoading ? (
              <div className="h-[200px] flex items-center justify-center opacity-60">
                <div className="text-center space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  <p className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-xs')}>
                    Loading activity data...
                  </p>
                </div>
              </div>
            ) : chartData && chartData.length > 0 ? (
              <div className="w-full min-w-0 h-[220px]">
                <CustomAreaChart
                  data={chartData}
                  xDataKey="date"
                  margin={{ top: 10, right: 10, bottom: 5, left: 10 }}
                  animationDuration={600}
                  aspectRatio="auto"
                  className="h-full w-full"
                >
                  <Grid horizontal numTicksRows={4} />
                  <CustomArea
                    dataKey="messages"
                    fill="var(--chart-1)"
                    fillOpacity={0.3}
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                  />
                  <CustomChartTooltip
                    showDatePill
                    rows={(point) => {
                      const rows: TooltipRow[] = [
                        {
                          color: 'var(--chart-1)',
                          label: 'Messages',
                          value: `${point.messages}`,
                        },
                      ];
                      return rows;
                    }}
                  />
                </CustomAreaChart>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <p className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-xs')}>No activity data</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Component for Subscription Information
