'use client';

import React from 'react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { LookoutFormDialog } from './lookout-form-dialog';

export type LookoutTab = 'active' | 'archived';

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

// Kumo's tokens mapped onto the app's theme.
const TABS_THEME =
  '[--color-kumo-tint:var(--accent)] [--color-kumo-base:var(--background)] [--color-kumo-recessed:var(--muted)] [--color-kumo-surface:var(--card)] [--text-color-kumo-default:var(--foreground)] [--text-color-kumo-strong:var(--muted-foreground)] [--text-color-kumo-subtle:var(--muted-foreground)] [--color-kumo-ring:var(--border)]';

interface LookoutToolbarProps {
  isMobile: boolean;
  activeTab: LookoutTab;
  onTabChange: (tab: LookoutTab) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  formProps: Omit<React.ComponentProps<typeof LookoutFormDialog>, 'isMobile'>;
}

// The Active/Archived tabs, the refresh button and the "add" button. On mobile
// the buttons come first, full width, above the tabs.
export function LookoutToolbar({
  isMobile,
  activeTab,
  onTabChange,
  isRefreshing,
  onRefresh,
  formProps,
}: LookoutToolbarProps) {
  const onValueChange = (value: string) => onTabChange(value === 'archived' ? 'archived' : 'active');

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex gap-3">
          <LookoutFormDialog isMobile {...formProps} />

          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh lookouts"
            className="px-3"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
              className={isRefreshing ? 'animate-spin' : ''}
            />
          </Button>
        </div>

        <KumoTabs
          variant="segmented"
          value={activeTab}
          onValueChange={onValueChange}
          className={`w-full ${TABS_THEME}`}
          listClassName="w-full [&>button]:flex-1 [&>button]:justify-center"
          tabs={TABS}
        />
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center">
      <KumoTabs
        variant="segmented"
        value={activeTab}
        onValueChange={onValueChange}
        className={TABS_THEME}
        tabs={TABS}
      />

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing} title="Refresh lookouts">
          <HugeiconsIcon
            icon={RefreshIcon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
            className={isRefreshing ? 'animate-spin' : ''}
          />
          <span className="ml-1.5">Refresh</span>
        </Button>
        <LookoutFormDialog isMobile={false} {...formProps} />
      </div>
    </div>
  );
}
