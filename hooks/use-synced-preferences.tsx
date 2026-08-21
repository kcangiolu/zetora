'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useUser } from '@/contexts/user-context';

export type PreferenceKey =
  | 'zetora-search-provider'
  | 'zetora-storage-provider'
  | 'zetora-email-provider'
  | 'zetora-group-order'
  | 'zetora-model-order-global'
  | 'zetora-blur-personal-info'
  | 'zetora-custom-instructions-enabled'
  | 'zetora-scroll-to-latest-on-open'
  | 'zetora-location-metadata-enabled'
  | 'zetora-auto-router-enabled'
  | 'zetora-auto-router-config'
  | 'zetora-anonymization-enabled'
  | 'zetora-anonymization-custom-terms'
  | 'zetora-anonymization-fail-open'
  | 'zetora-anonymization-language'
  | 'zetora-anonymization-ner-enabled'
  | 'zetora-preferred-models'
  | 'zetora-visible-modes'
  | 'zetora-enabled-sources'
  | 'zetora-disabled-skills'
  | 'zetora-extension-connectors'
  | 'zetora-default-group'
  | 'zetora-sandbox-provider'
  | 'zetora-extreme-content-provider'
  | 'zetora-search-stack'
  | 'zetora-embedding-provider'
  | 'zetora-embedding-model'
  | 'zetora-file-embedding-provider'
  | 'zetora-qdrant-enabled'
  | 'zetora-tertiary-chat-title-model'
  | 'zetora-tertiary-chat-title-provider'
  | 'zetora-tertiary-chat-title-effort'
  | 'zetora-tertiary-chat-title-enabled'
  | 'zetora-tertiary-followup-model'
  | 'zetora-tertiary-followup-provider'
  | 'zetora-tertiary-followup-effort'
  | 'zetora-tertiary-followup-enabled'
  | 'zetora-tertiary-enhance-model'
  | 'zetora-tertiary-enhance-provider'
  | 'zetora-tertiary-enhance-effort'
  | 'zetora-tertiary-tool-repair-model'
  | 'zetora-tertiary-tool-repair-provider'
  | 'zetora-tertiary-tool-repair-effort'
  | 'zetora-tertiary-auto-router-model'
  | 'zetora-tertiary-auto-router-provider'
  | 'zetora-tertiary-auto-router-effort'
  | 'zetora-tertiary-translate-text-model'
  | 'zetora-tertiary-translate-text-provider'
  | 'zetora-tertiary-translate-text-effort'
  | 'zetora-tertiary-translate-vision-model'
  | 'zetora-tertiary-translate-vision-provider'
  | 'zetora-tertiary-translate-vision-effort'
  | 'zetora-tertiary-lang-detect-model'
  | 'zetora-tertiary-lang-detect-provider'
  | 'zetora-tertiary-lang-detect-effort'
  | 'zetora-tertiary-extreme-planner-model'
  | 'zetora-tertiary-extreme-planner-provider'
  | 'zetora-tertiary-extreme-planner-effort'
  | 'zetora-tertiary-extreme-agent-model'
  | 'zetora-tertiary-extreme-agent-provider'
  | 'zetora-tertiary-extreme-agent-effort'
  | 'zetora-default-model'
  | 'zetora-default-provider'
  | 'zetora-default-effort'
  | 'zetora-lockout-provider'
  | 'zetora-memory-provider'
  | 'zetora-graphiti-llm-model'
  | 'zetora-graphiti-llm-base-url'
  | 'zetora-graphiti-llm-api-key'
  | 'zetora-graphiti-active-provider'
  | 'zetora-graphiti-small-llm-provider'
  | 'zetora-graphiti-small-llm-model'
  | 'zetora-graphiti-embedding-provider'
  | 'zetora-graphiti-embedding-model'
  | 'zetora-embedding-enabled'
  | 'zetora-hybrid-search-enabled'
  | 'zetora-content-indexing-enabled'
  | 'zetora-rerank-enabled'
  | 'zetora-xml-tool-parsing-enabled'
  | 'zetora-xql-enabled'
  | 'zetora-lookout-enabled'
  | 'zetora-voice-enabled'
  | 'zetora-apps-enabled'
  | 'zetora-swarm-enabled'
  | 'zetora-connectors-enabled'
  | 'zetora-canvas-enabled'
  | 'zetora-agent-enabled'
  | 'zetora-fallback-firecrawl-content'
  | 'zetora-fallback-metadata'
  | 'zetora-fallback-notte'
  | 'zetora-fallback-exa-browse'
  | 'zetora-fallback-search-firecrawl'
  | 'zetora-fallback-retrieve-parallel'
  | 'zetora-fallback-retrieve-firecrawl'
  | 'zetora-fallback-retrieve-fastcrw'
  | 'zetora-fallback-retrieve-exa'
  | 'zetora-search-fallback-provider'
  | 'zetora-tts-provider'
  | 'zetora-tts-custom-provider-id'
  | 'zetora-tts-openai-model'
  | 'zetora-tts-openai-voice'
  | 'zetora-tts-openai-language'
  | 'zetora-stt-provider'
  | 'zetora-stt-custom-provider-id'
  | 'zetora-stt-openai-model'
  | 'zetora-image-gen-custom-provider-id'
  | 'zetora-image-gen-model'
  | 'zetora-image-gen-request-body'
  | 'zetora-image-edit-custom-provider-id'
  | 'zetora-image-edit-model'
  | 'zetora-image-edit-request-body'
  | 'zetora-image-gen-system-prompt'
  | 'zetora-image-gen-prompt-presets'
  | 'zetora-image-edit-system-prompt'
  | 'zetora-image-edit-prompt-presets'
  | 'zetora-voice-s2s-backend'
  | 'zetora-tertiary-voice-model'
  | 'zetora-tertiary-voice-provider'
  | 'zetora-tertiary-voice-effort'
  | 'zetora-memory-curator-enabled'
  | 'zetora-tertiary-memory-curator-model'
  | 'zetora-tertiary-memory-curator-provider'
  | 'zetora-tertiary-memory-curator-effort'
  | 'zetora-tertiary-agent-worker-model'
  | 'zetora-tertiary-agent-worker-provider'
  | 'zetora-tertiary-agent-worker-effort'
  | 'zetora-tertiary-agent-guard-model'
  | 'zetora-tertiary-agent-guard-provider'
  | 'zetora-tertiary-agent-guard-effort'
  | 'zetora-system-prompt-override'
  | 'zetora-system-prompt-presets';

type AutoRouterConfig = {
  routes: Array<{
    name: string;
    description: string;
    model: string;
  }>;
};

type GraphitiProvider = { id: string; name: string; baseURL: string; apiKey?: string };

export type ImageGenPromptPreset = { id: string; name: string; prompt: string; model?: string };

export type SystemPromptPreset = { id: string; name: string; prompt: string };

type PreferenceValue =
  | string
  | string[]
  | boolean
  | number
  | AutoRouterConfig
  | GraphitiProvider[]
  | ImageGenPromptPreset[]
  | SystemPromptPreset[]
  | Record<string, string>
  | undefined;

const DEBOUNCE_MS = 300; // Debounce DB writes by 300ms
const MIGRATION_KEY_PREFIX = 'zetora-prefs-migrated-';

interface UserPreferencesRecord {
  preferences?: Partial<Record<PreferenceKey, PreferenceValue>>;
}

async function fetchUserPreferences(): Promise<UserPreferencesRecord | null> {
  const response = await fetch('/api/preferences', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Failed to fetch user preferences');

  return response.json();
}

async function persistUserPreferences(preferences: Partial<Record<PreferenceKey, PreferenceValue>>): Promise<void> {
  const response = await fetch('/api/preferences', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ preferences }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to save user preferences');
  }
}

// Get the initial value from localStorage synchronously
function getStoredValue<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;

  const item = localStorage.getItem(key);
  if (!item) return defaultValue;

  if (item === 'undefined') return defaultValue;

  try {
    return JSON.parse(item);
  } catch {
    return item as unknown as T;
  }
}

// `!==` is a reference check - useless for the array/object-typed preference
// keys (dbValue is always a fresh JSON.parse, never === the ref'd local
// value even when identical). Compare serialized form instead so remounts
// of unchanged array/object prefs don't re-broadcast every time.
function hasChanged(a: PreferenceValue, b: PreferenceValue): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

// Check if preferences have been migrated for this user
function hasMigratedPreferences(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${MIGRATION_KEY_PREFIX}${userId}`) === 'true';
}

// Mark preferences as migrated for this user
function markPreferencesMigrated(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${MIGRATION_KEY_PREFIX}${userId}`, 'true');
}

// Every useSyncedPreferences instance (one per preference key) independently
// runs a "migrate on first load" effect gated on this same per-user
// localStorage flag. Navigating somewhere that mounts many keys at once
// (e.g. Settings, which touches dozens) fires all those effects in the same
// React commit, before any of them has had a chance to write the flag — so
// every instance sees "not migrated yet" and each independently POSTs +
// invalidates the shared preferences query, and each invalidation re-renders
// every other instance, which repeats the same race. This module-level
// promise cache collapses that fan-out to one migration per user no matter
// how many hook instances mount simultaneously.
const migrationInFlight = new Map<string, Promise<void>>();

function migrateOnce(userId: string, queryClient: QueryClient): void {
  if (hasMigratedPreferences(userId) || migrationInFlight.has(userId)) return;

  const localPrefs = collectLocalStoragePreferences();
  const promise = (Object.keys(localPrefs).length === 0 ? Promise.resolve() : persistUserPreferences(localPrefs))
    .catch((error) => {
      console.error('Failed to migrate preferences:', error);
    })
    .then(() => {
      markPreferencesMigrated(userId);
      queryClient.invalidateQueries({ queryKey: ['userPreferences', userId] });
      migrationInFlight.delete(userId);
    });
  migrationInFlight.set(userId, promise);
}

// Collect all localStorage preferences
function collectLocalStoragePreferences(): Partial<Record<PreferenceKey, PreferenceValue>> {
  if (typeof window === 'undefined') return {};

  const preferences: Partial<Record<PreferenceKey, PreferenceValue>> = {};

  const keys: PreferenceKey[] = [
    'zetora-search-provider',
    'zetora-storage-provider',
    'zetora-email-provider',
    'zetora-group-order',
    'zetora-model-order-global',
    'zetora-blur-personal-info',
    'zetora-custom-instructions-enabled',
    'zetora-scroll-to-latest-on-open',
    'zetora-location-metadata-enabled',
    'zetora-auto-router-enabled',
    'zetora-auto-router-config',
    'zetora-preferred-models',
    'zetora-visible-modes',
    'zetora-enabled-sources',
    'zetora-disabled-skills',
    'zetora-default-group',
    'zetora-sandbox-provider',
    'zetora-extreme-content-provider',
    'zetora-search-stack',
    'zetora-embedding-provider',
    'zetora-embedding-model',
    'zetora-qdrant-enabled',
    'zetora-tertiary-chat-title-model',
    'zetora-tertiary-chat-title-provider',
    'zetora-tertiary-followup-model',
    'zetora-tertiary-followup-provider',
    'zetora-tertiary-enhance-model',
    'zetora-tertiary-enhance-provider',
    'zetora-tertiary-tool-repair-model',
    'zetora-tertiary-tool-repair-provider',
    'zetora-tertiary-auto-router-model',
    'zetora-tertiary-auto-router-provider',
    'zetora-tertiary-translate-text-model',
    'zetora-tertiary-translate-text-provider',
    'zetora-tertiary-translate-vision-model',
    'zetora-tertiary-translate-vision-provider',
    'zetora-tertiary-lang-detect-model',
    'zetora-tertiary-lang-detect-provider',
    'zetora-tertiary-extreme-planner-model',
    'zetora-tertiary-extreme-planner-provider',
    'zetora-tertiary-extreme-agent-model',
    'zetora-tertiary-extreme-agent-provider',
    'zetora-default-model',
    'zetora-default-provider',
    'zetora-lockout-provider',
    'zetora-fallback-firecrawl-content',
    'zetora-fallback-metadata',
    'zetora-fallback-notte',
    'zetora-fallback-exa-browse',
    'zetora-fallback-search-firecrawl',
    'zetora-fallback-retrieve-parallel',
    'zetora-fallback-retrieve-firecrawl',
    'zetora-fallback-retrieve-fastcrw',
    'zetora-fallback-retrieve-exa',
    'zetora-search-fallback-provider',
  ];

  keys.forEach((key) => {
    try {
      const item = localStorage.getItem(key);
      if (item && item !== 'undefined') {
        preferences[key] = JSON.parse(item);
      }
    } catch {
      // Ignore parse errors
    }
  });

  return preferences;
}

export function useSyncedPreferences<T extends PreferenceValue>(
  key: PreferenceKey,
  defaultValue: T,
): [T, (value: T | ((val: T) => T)) => void, boolean] {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<Partial<Record<PreferenceKey, PreferenceValue>> | null>(null);
  // Counter (not boolean) so concurrent saves don't accidentally clear each other's flag
  const pendingSaveCountRef = useRef<number>(0);

  // Must start from `defaultValue`, not localStorage: the lazy initializer runs
  // during the client's hydration render too (window is defined then), so
  // reading localStorage here would diverge from the server-rendered markup
  // whenever a returning user's stored value differs from the default —
  // exactly the branch-on-`typeof window` hydration mismatch React warns
  // about. The real stored value is instead applied client-only, post-mount,
  // in the effect below.
  const [localValue, setLocalValue] = useState<T>(defaultValue);
  const didHydrateFromStorageRef = useRef(false);

  // Apply the localStorage value once, after the hydration render has already
  // committed and matched the server — safe to diverge from `defaultValue`
  // here since this only ever runs on the client.
  useEffect(() => {
    if (didHydrateFromStorageRef.current) return;
    didHydrateFromStorageRef.current = true;

    const stored = getStoredValue(key, defaultValue);
    if (hasChanged(stored, defaultValue)) {
      // Intentional: this is the client-only sync from an external system
      // (localStorage) the hydration-mismatch fix above requires — not a
      // derived-state anti-pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalValue(stored);
    }
    // Runs once per mount (per preference key) — intentionally not re-run when
    // `defaultValue` changes, since callers often pass a fresh array/object
    // literal each render and re-running would fight the debounced DB sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Fetch preferences from DB
  const { data: dbPreferences, isFetched: dbPreferencesFetched } = useQuery({
    queryKey: ['userPreferences', user?.id],
    queryFn: fetchUserPreferences,
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Whether `localValue` reflects its final source: either there's no logged-in
  // user (localStorage/default is authoritative), or the DB fetch has settled.
  // Callers that need to act once on the "true" value (e.g. auto-scroll-on-open)
  // must wait for this instead of trusting the first (possibly stale-default) render.
  const isResolved = !user?.id || dbPreferencesFetched;

  // Migrate localStorage to DB on first load (see migrateOnce for why this
  // must be deduped across the many simultaneously-mounting hook instances).
  useEffect(() => {
    if (!user?.id) return;
    migrateOnce(user.id, queryClient);
  }, [user?.id, queryClient]);

  // Track the last user ID to detect login
  const lastSyncedUserIdRef = useRef<string | null>(null);
  // Track current local value to compare without causing re-renders
  const localValueRef = useRef<T>(localValue);

  // Keep ref in sync with state
  useEffect(() => {
    localValueRef.current = localValue;
  }, [localValue]);

  // Sync DB preferences when user logs in or DB data changes
  // This handles: 1) Login sync, 2) Cross-device sync
  useEffect(() => {
    if (!user?.id || !dbPreferences?.preferences) return;

    const dbValue = dbPreferences.preferences[key];
    const isUserLogin = lastSyncedUserIdRef.current !== user.id;

    // On login: sync from DB (user expects their synced preferences), but only
    // write/broadcast if the value actually differs - every remount (e.g. page
    // navigation re-mounting the sidebar) hits this branch since the ref resets,
    // and without this check it would re-dispatch a global event on every nav,
    // fanning out across every other mounted instance of the same key.
    if (isUserLogin) {
      lastSyncedUserIdRef.current = user.id;
      if (dbValue !== undefined && hasChanged(dbValue, localValueRef.current)) {
        setLocalValue(dbValue as T);
        localStorage.setItem(key, JSON.stringify(dbValue));
        window.dispatchEvent(new CustomEvent('localStorage-change', { detail: { key, value: dbValue } }));
      }
      return;
    }

    // After login: only sync if no pending save (don't overwrite user's current changes)
    if (pendingSaveCountRef.current > 0) return;
    if (dbValue !== undefined && hasChanged(dbValue, localValueRef.current)) {
      setLocalValue(dbValue as T);
      localStorage.setItem(key, JSON.stringify(dbValue));
      window.dispatchEvent(new CustomEvent('localStorage-change', { detail: { key, value: dbValue } }));
    }
  }, [dbPreferences, key, user?.id]); // No localValue in deps - use ref instead

  // Listen for storage changes from other tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          const newValue = JSON.parse(e.newValue);
          setLocalValue(newValue);
        } catch {
          // Ignore parse errors
        }
      }
    };

    const handleCustomStorageChange = (e: CustomEvent) => {
      if (e.detail.key === key) {
        setLocalValue(e.detail.value);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorage-change', handleCustomStorageChange as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorage-change', handleCustomStorageChange as EventListener);
    };
  }, [key]);

  // Debounced function to save to DB
  const saveToDB = useCallback(
    (updates: Partial<Record<PreferenceKey, PreferenceValue>>) => {
      if (!user?.id) return;

      // Increment counter for this in-flight save
      pendingSaveCountRef.current += 1;

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Merge with pending updates
      pendingUpdateRef.current = {
        ...pendingUpdateRef.current,
        ...updates,
      };

      // Set new timer
      debounceTimerRef.current = setTimeout(() => {
        const toSave = pendingUpdateRef.current;
        if (!toSave) {
          pendingSaveCountRef.current -= 1;
          return;
        }

        // Send only the changes - the server will handle merging
        persistUserPreferences(toSave)
          .then(() => {
            pendingSaveCountRef.current -= 1;
            // Update the cache directly to avoid a round-trip refetch that can
            // race with in-progress keystrokes and overwrite the local value.
            queryClient.setQueryData(['userPreferences', user.id], (old: UserPreferencesRecord | null | undefined) => ({
              ...old,
              preferences: { ...old?.preferences, ...toSave },
            }));
          })
          .catch((error) => {
            console.error('Failed to save preferences to DB:', error);
            pendingSaveCountRef.current -= 1;
          });

        pendingUpdateRef.current = null;
      }, DEBOUNCE_MS);
    },
    [user?.id, queryClient], // Removed dbPreferencesRef as we don't need it anymore
  );

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const nextValue = value instanceof Function ? value(localValue) : value;

        // Update React state immediately (optimistic update)
        setLocalValue(nextValue);

        // Update localStorage immediately
        if (typeof window !== 'undefined') {
          if (nextValue === undefined) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, JSON.stringify(nextValue));
          }

          // Dispatch custom event for same-tab synchronization
          const customEvent = new CustomEvent('localStorage-change', {
            detail: { key, value: nextValue },
          });
          window.dispatchEvent(customEvent);
        }

        // Sync to DB in background (debounced)
        if (user?.id) {
          saveToDB({ [key]: nextValue });
        }
      } catch (error) {
        console.warn(`Error saving preference "${key}":`, error);
      }
    },
    [key, localValue, user?.id, saveToDB],
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return [localValue, setValue, isResolved];
}
