import { useCallback, useSyncExternalStore } from 'react';

// Parse cache keyed by storage key so getSnapshot returns a stable identity
// for unchanged raw values (useSyncExternalStore requires cached snapshots).
const parseCache = new Map<string, { raw: string; value: unknown }>();

function readStoredValue<T>(key: string, defaultValue: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === 'undefined') return defaultValue;

  const cached = parseCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  parseCache.set(key, { raw, value });
  return value as T;
}

function subscribeToKey(key: string, onStoreChange: () => void) {
  // Cross-tab updates
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === key) onStoreChange();
  };
  // Same-tab updates (dispatched by setValue below)
  const handleCustomStorageChange = (e: Event) => {
    if ((e as CustomEvent).detail?.key === key) onStoreChange();
  };

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('localStorage-change', handleCustomStorageChange);
  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('localStorage-change', handleCustomStorageChange);
  };
}

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const subscribe = useCallback((onStoreChange: () => void) => subscribeToKey(key, onStoreChange), [key]);

  // Server snapshot is the default so hydration matches SSR output; the real
  // stored value is read on the client without a post-mount setState pass.
  const storedValue = useSyncExternalStore(
    subscribe,
    () => readStoredValue(key, defaultValue),
    () => defaultValue,
  );

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const nextValue = value instanceof Function ? value(readStoredValue(key, defaultValue)) : value;
        if (nextValue === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(nextValue));
        }

        // Notify same-tab subscribers ('storage' only fires across tabs)
        window.dispatchEvent(new CustomEvent('localStorage-change', { detail: { key, value: nextValue } }));
      } catch (error) {
        console.warn(`Error saving to localStorage key "${key}":`, error);
      }
    },
    [key, defaultValue],
  );

  return [storedValue, setValue];
}
