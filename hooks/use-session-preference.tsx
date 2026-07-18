'use client';

import { useCallback, useEffect, useState } from 'react';

// Browser-session-scoped preference: lives in sessionStorage only, never
// synced to the DB or shared with the account-wide zetora-enabled-sources
// preference. Used for toggles that should apply "for this browser session"
// (e.g. hiding a source from the chat picker) without touching the permanent
// Customize settings that other surfaces (and other sessions/devices) read.
function getStoredValue<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;

  const item = sessionStorage.getItem(key);
  if (!item || item === 'undefined') return defaultValue;

  try {
    return JSON.parse(item);
  } catch {
    return defaultValue;
  }
}

export function useSessionPreference<T>(key: string, defaultValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [value, setValueState] = useState<T>(() => getStoredValue(key, defaultValue));

  useEffect(() => {
    const handleSessionChange = (e: CustomEvent) => {
      if (e.detail.key === key) {
        setValueState(e.detail.value);
      }
    };

    window.addEventListener('sessionStorage-change', handleSessionChange as EventListener);
    return () => window.removeEventListener('sessionStorage-change', handleSessionChange as EventListener);
  }, [key]);

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      setValueState((current) => {
        const nextValue = value instanceof Function ? value(current) : value;

        if (typeof window !== 'undefined') {
          sessionStorage.setItem(key, JSON.stringify(nextValue));
          window.dispatchEvent(new CustomEvent('sessionStorage-change', { detail: { key, value: nextValue } }));
        }

        return nextValue;
      });
    },
    [key],
  );

  return [value, setValue];
}
