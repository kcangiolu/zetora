import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

// False during the server render and hydration, true on the client after that.
// For output that can only be computed in the browser (theme, window size).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}
