'use client';

import React from 'react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { BinocularsIcon } from '@hugeicons/core-free-icons';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { useLookouts, type Lookout } from '@/hooks/use-lookouts';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { sileo } from 'sileo';

import { LoadingSkeletons } from './components/loading-skeleton';
import { NoActiveLookoutsEmpty, NoArchivedLookoutsEmpty } from './components/empty-state';
import { TotalLimitWarning, DailyLimitWarning } from './components/warning-card';
import { DeleteLookoutDialog } from './components/delete-lookout-dialog';
import { ExampleLookouts } from './components/example-lookouts';
import { LookoutDetailsPanel } from './components/lookout-details-panel';
import { LookoutGrid, NewLookoutCard } from './components/lookout-grid';
import { LookoutToolbar, type LookoutTab } from './components/lookout-toolbar';
import { useLookoutForm } from './hooks/use-lookout-form';
import { detectTimezone } from './utils/detect-timezone';
import { LOOKOUT_LIMITS } from '@/lib/lookout/limits';

// The timezone never changes during a visit, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};

export default function LookoutPage() {
  const [activeTab, setActiveTab] = React.useState<LookoutTab>('active');
  const isMobile = useIsMobile();

  // The id, not a copy: the sidebar shows the lookout as polling updates it.
  const [selectedLookoutId, setSelectedLookoutId] = React.useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const [lookoutToDelete, setLookoutToDelete] = React.useState<string | null>(null);

  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();

  const {
    lookouts: allLookouts,
    isLoading,
    error,
    createLookout,
    updateStatus,
    forceStopLookout,
    updateLookout,
    deleteLookout,
    testLookout,
    refresh,
    isRefreshing,
    isPending: isMutating,
  } = useLookouts();

  // Server render and hydration use UTC, the client then reads the browser's timezone.
  const detectedTimezone = React.useSyncExternalStore(subscribeToNothing, detectTimezone, () => 'UTC');
  const formHook = useLookoutForm(detectedTimezone);

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/sign-in');
    }
  }, [user, isUserLoading, router]);

  React.useEffect(() => {
    if (error) {
      sileo.error({ title: 'Failed to load lookouts' });
    }
  }, [error]);

  const activeDailyLookouts = allLookouts.filter(
    (lookout) => lookout.frequency === 'daily' && lookout.status === 'active',
  ).length;
  const totalLookouts = allLookouts.filter((lookout) => lookout.status !== 'archived').length;
  const canCreateMore = totalLookouts < LOOKOUT_LIMITS.TOTAL_LOOKOUTS;
  const canCreateDailyMore = activeDailyLookouts < LOOKOUT_LIMITS.DAILY_LOOKOUTS;

  const filteredLookouts = allLookouts.filter((lookout) =>
    activeTab === 'archived' ? lookout.status === 'archived' : lookout.status !== 'archived',
  );
  const selectedLookout = allLookouts.find((lookout) => lookout.id === selectedLookoutId) ?? null;

  const cardHandlers = {
    isMutating,
    onStatusChange: (id: string, status: 'active' | 'paused' | 'archived') => updateStatus({ id, status }),
    onDelete: setLookoutToDelete,
    onTest: (id: string) => testLookout({ id }),
    onForceStop: (id: string) => forceStopLookout({ id }),
    onOpenDetails: (lookout: Lookout) => {
      setSelectedLookoutId(lookout.id);
      setIsSidebarOpen(true);
    },
  };

  const confirmDelete = () => {
    if (lookoutToDelete) {
      deleteLookout({ id: lookoutToDelete });
      setLookoutToDelete(null);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex-1 flex flex-col justify-center py-8">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSkeletons count={3} />
        </div>
      </div>
    );
  }

  return (
    <>
      {selectedLookout && (
        <LookoutDetailsPanel
          lookout={selectedLookout}
          allLookouts={allLookouts}
          open={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onLookoutChange={(lookout) => setSelectedLookoutId(lookout.id)}
          onEditLookout={(lookout) => {
            formHook.populateFormForEdit(lookout);
            setIsSidebarOpen(false);
          }}
          onTest={cardHandlers.onTest}
        />
      )}

      <div className="flex-1 min-h-screen flex flex-col justify-center">
        <div className="flex-1 flex flex-col justify-center py-8">
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-center gap-3 relative">
                {/* Mobile sidebar trigger */}
                <div className="md:hidden absolute left-0">
                  <SidebarTrigger />
                </div>
                <HugeiconsIcon
                  icon={BinocularsIcon}
                  size={24}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="text-muted-foreground"
                />
                <h1 className="text-xl font-semibold tracking-tight">Lookout</h1>
                <span className="font-pixel text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                  {totalLookouts}/{LOOKOUT_LIMITS.TOTAL_LOOKOUTS}
                </span>
              </div>

              <LookoutToolbar
                isMobile={isMobile}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                isRefreshing={isRefreshing}
                onRefresh={() => refresh()}
                formProps={{
                  formHook,
                  isMutating,
                  activeDailyLookouts,
                  totalLookouts,
                  canCreateMore,
                  canCreateDailyMore,
                  createLookout,
                  updateLookout,
                }}
              />
            </div>

            {!canCreateMore && <TotalLimitWarning />}
            {canCreateMore && !canCreateDailyMore && <DailyLimitWarning />}

            <div className="space-y-6">
              {activeTab === 'active' && (
                <div className="space-y-6">
                  {isLoading ? (
                    <LoadingSkeletons count={3} />
                  ) : filteredLookouts.length === 0 ? (
                    <NoActiveLookoutsEmpty />
                  ) : (
                    <LookoutGrid lookouts={filteredLookouts} {...cardHandlers}>
                      {canCreateMore && <NewLookoutCard onClick={() => formHook.handleDialogOpenChange(true)} />}
                    </LookoutGrid>
                  )}
                </div>
              )}

              {activeTab === 'archived' && (
                <div>
                  {isLoading ? (
                    <LoadingSkeletons count={2} showActions={false} />
                  ) : filteredLookouts.length === 0 ? (
                    <NoArchivedLookoutsEmpty />
                  ) : (
                    <LookoutGrid lookouts={filteredLookouts} {...cardHandlers} showActions={false} />
                  )}
                </div>
              )}
            </div>

            <ExampleLookouts onUseExample={formHook.handleUseExample} />
          </div>
        </div>
      </div>

      <DeleteLookoutDialog
        open={lookoutToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setLookoutToDelete(null);
        }}
        onConfirm={confirmDelete}
      />
    </>
  );
}
