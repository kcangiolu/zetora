'use client';

import React from 'react';
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';
import {
  createScheduledLookout,
  getUserLookouts,
  updateLookoutStatusAction,
  forceStopLookoutAction,
  updateLookoutAction,
  deleteLookoutAction,
  testLookoutAction,
} from '@/app/actions';

/** A lookout as the Lookout page receives it. */
export type Lookout = Extract<Awaited<ReturnType<typeof getUserLookouts>>, { success: true }>['lookouts'][number];
export type LookoutRun = NonNullable<Lookout['runHistory']>[number];

export type CreateLookoutParams = Parameters<typeof createScheduledLookout>[0];
export type UpdateLookoutParams = Parameters<typeof updateLookoutAction>[0];

type WithOnSuccess<T> = T & { onSuccess?: () => void };

export function getLastRun(lookout: Lookout): LookoutRun | null {
  return lookout.runHistory?.at(-1) ?? null;
}

const LOOKOUTS_KEY = ['lookouts', 'list'] as const;

// Polled to follow runs: closely while one is going, loosely otherwise.
const RUNNING_POLL_MS = 3_000;
const IDLE_POLL_MS = 10_000;

export function useLookouts() {
  const queryClient = useQueryClient();

  // The previous list, to notice runs that just finished.
  const previousLookoutsRef = React.useRef<Lookout[]>([]);

  const {
    data: lookouts = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: LOOKOUTS_KEY,
    queryFn: async () => {
      const result = await getUserLookouts();
      if (result.success) return result.lookouts;
      throw new Error(result.error || 'Failed to load lookouts');
    },
    refetchInterval: (query) =>
      query.state.data?.some((lookout) => lookout.status === 'running') ? RUNNING_POLL_MS : IDLE_POLL_MS,
    refetchIntervalInBackground: false,
  });
  const isRefreshing = useIsFetching({ queryKey: LOOKOUTS_KEY }) > 0;

  // A toast for each run that finished since the last poll.
  React.useEffect(() => {
    const previousLookouts = previousLookoutsRef.current;
    previousLookoutsRef.current = lookouts;

    for (const lookout of lookouts) {
      const previous = previousLookouts.find((candidate) => candidate.id === lookout.id);
      if (previous?.status !== 'running' || lookout.status === 'running') continue;
      if (lookout.lastRunAt?.getTime() === previous.lastRunAt?.getTime()) continue;

      const lastRun = getLastRun(lookout);
      const statusText = lookout.frequency === 'once' ? 'completed' : 'run finished';
      if (!lastRun || lastRun.status === 'success') {
        sileo.success({ title: `Lookout "${lookout.title}" ${statusText} successfully!` });
      } else if (lastRun.status === 'timeout') {
        sileo.show({ title: `Lookout "${lookout.title}" ${statusText} (timed out)`, description: lastRun.error });
      } else {
        sileo.error({ title: `Lookout "${lookout.title}" ${statusText} (failed)`, description: lastRun.error });
      }
    }
  }, [lookouts]);

  const refresh = React.useCallback(() => queryClient.invalidateQueries({ queryKey: LOOKOUTS_KEY }), [queryClient]);

  // Applies `change` to the cached list right away; `rollback` puts it back.
  const optimistic = async (change: (lookouts: Lookout[]) => Lookout[]) => {
    await queryClient.cancelQueries({ queryKey: LOOKOUTS_KEY });
    const previousLookouts = queryClient.getQueryData<Lookout[]>(LOOKOUTS_KEY);
    queryClient.setQueryData<Lookout[]>(LOOKOUTS_KEY, (old = []) => change(old));
    return { previousLookouts };
  };

  const rollback = (error: Error, context: { previousLookouts?: Lookout[] } | undefined) => {
    if (context?.previousLookouts) {
      queryClient.setQueryData(LOOKOUTS_KEY, context.previousLookouts);
    }
    sileo.error({ title: error.message });
  };

  const showError = (error: Error) => {
    sileo.error({ title: error.message });
  };

  const createMutation = useMutation({
    mutationFn: async ({ onSuccess, ...params }: WithOnSuccess<CreateLookoutParams>) => {
      const result = await createScheduledLookout(params);
      if (!result.success) throw new Error(result.error || 'Failed to create lookout');
      return { onSuccess };
    },
    onSuccess: ({ onSuccess }) => {
      sileo.success({ title: 'Lookout created successfully!' });
      onSuccess?.();
    },
    onError: showError,
    onSettled: refresh,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (params: { id: string; status: 'active' | 'paused' | 'archived' }) => {
      const result = await updateLookoutStatusAction(params);
      if (!result.success) throw new Error(result.error || 'Failed to update lookout');
      return params;
    },
    onMutate: ({ id, status }) =>
      optimistic((old) => old.map((lookout) => (lookout.id === id ? { ...lookout, status } : lookout))),
    onSuccess: ({ status }) => {
      const statusText = { active: 'activated', paused: 'paused', archived: 'archived' }[status];
      sileo.success({ title: `Lookout ${statusText}` });
    },
    onError: (error: Error, _params, context) => rollback(error, context),
    onSettled: refresh,
  });

  // Unsticks a lookout whose run died; the server decides the status it gets back.
  const forceStopMutation = useMutation({
    mutationFn: async (params: { id: string }) => {
      const result = await forceStopLookoutAction(params);
      if (!result.success) throw new Error(result.error || 'Failed to stop lookout');
    },
    onSuccess: () => {
      sileo.success({ title: 'Lookout stopped' });
    },
    onError: showError,
    onSettled: refresh,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ onSuccess, ...params }: WithOnSuccess<UpdateLookoutParams>) => {
      const result = await updateLookoutAction(params);
      if (!result.success) throw new Error(result.error || 'Failed to update lookout');
      return { onSuccess };
    },
    onSuccess: ({ onSuccess }) => {
      sileo.success({ title: 'Lookout updated successfully!' });
      onSuccess?.();
    },
    onError: showError,
    onSettled: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async (params: { id: string }) => {
      const result = await deleteLookoutAction(params);
      if (!result.success) throw new Error(result.error || 'Failed to delete lookout');
    },
    onMutate: ({ id }) => optimistic((old) => old.filter((lookout) => lookout.id !== id)),
    onSuccess: () => {
      sileo.success({ title: 'Lookout deleted successfully' });
    },
    onError: (error: Error, _params, context) => rollback(error, context),
    onSettled: refresh,
  });

  const testMutation = useMutation({
    mutationFn: async (params: { id: string }) => {
      const result = await testLookoutAction(params);
      if (!result.success) throw new Error(result.error || 'Failed to test lookout');
    },
    onMutate: ({ id }) =>
      optimistic((old) =>
        old.map((lookout) => (lookout.id === id ? { ...lookout, status: 'running' as const } : lookout)),
      ),
    onSuccess: () => {
      sileo.success({ title: "Test run started - you'll be notified when complete!" });
    },
    onError: (error: Error, _params, context) => rollback(error, context),
    onSettled: refresh,
  });

  return {
    lookouts,
    isLoading,
    isRefreshing,
    error,
    refresh,

    createLookout: createMutation.mutate,
    updateStatus: updateStatusMutation.mutate,
    forceStopLookout: forceStopMutation.mutate,
    updateLookout: updateMutation.mutate,
    deleteLookout: deleteMutation.mutate,
    testLookout: testMutation.mutate,

    isPending:
      createMutation.isPending ||
      updateStatusMutation.isPending ||
      forceStopMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      testMutation.isPending,
  };
}
