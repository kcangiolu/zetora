'use client';

import { useEffect } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useSession } from '@/lib/auth-client';
import { type ComprehensiveUserData } from '@/lib/user-data';

export function useCachedUserData() {
  const { data: session, isPending: isSessionPending } = useSession();

  // Get fresh data from the existing hook
  const { user: freshUser, isLoading: isFreshLoading, error, refetch, isRefetching } = useUserData();

  // Cache user data in localStorage
  const [cachedUser, setCachedUser] = useLocalStorage<ComprehensiveUserData | null>('zetora-user-data', null);

  // Only write to cache when we have a session; prevents re-caching after sign out (React Query may still hold stale data)
  useEffect(() => {
    if (session && freshUser && !isFreshLoading) {
      setCachedUser(freshUser);
    }
  }, [session, freshUser, isFreshLoading, setCachedUser]);

  // Clear cache only after both session and user fetch confirm sign-out
  useEffect(() => {
    if (!isSessionPending && !session && !isFreshLoading && freshUser === null && cachedUser) {
      setCachedUser(null);
    }
  }, [isSessionPending, session, isFreshLoading, freshUser, cachedUser, setCachedUser]);

  // Prefer fresh server data when available; only fall back to cached localStorage
  // data during initial load (before React Query has returned any data).
  // When signed out (session known to be null), never expose cached data.
  const user = !isSessionPending && !session ? null : freshUser !== undefined ? freshUser : cachedUser;

  // Show loading only if we have no cached data and fresh data is loading
  const isLoading = !cachedUser && isFreshLoading;

  return {
    // Core user data
    user,
    isLoading,
    error,
    refetch,
    isRefetching,

    // Additional utilities
    isCached: Boolean(cachedUser),
    clearCache: () => setCachedUser(null),
  };
}
