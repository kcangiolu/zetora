import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncer } from '@tanstack/react-pacer';

const CACHE_LIMIT = 200;

// Query suggestions under the input of a new chat, with keyboard highlighting.
export function useAutocomplete({ enabled }: { enabled: boolean }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, string[]>());

  const show = useCallback((items: string[]) => {
    setSuggestions(items);
    setHighlightedIndex(-1);
    setIsOpen(items.length > 0);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setSuggestions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, []);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      const q = query.trim().toLowerCase();
      if (!enabled || q.length < 1) {
        clear();
        return;
      }

      const cached = cacheRef.current.get(q);
      if (cached) {
        show(cached);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error('suggest failed');
        const data = await res.json();
        const items: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        if (controller.signal.aborted) return;
        if (cacheRef.current.size > CACHE_LIMIT) {
          const oldest = cacheRef.current.keys().next().value;
          if (oldest) cacheRef.current.delete(oldest);
        }
        cacheRef.current.set(q, items);
        show(items);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setIsOpen(false);
        }
      }
    },
    [enabled, clear, show],
  );

  const debouncer = useDebouncer(fetchSuggestions, { wait: 50, key: 'autocomplete' });
  const request = useCallback((value: string) => debouncer.maybeExecute(value), [debouncer]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Nothing shows once the chat has started or while a trigger popup is open.
  const hasSuggestions = enabled && isOpen && suggestions.length > 0;

  return {
    suggestions,
    highlightedIndex,
    setHighlightedIndex,
    isOpen: hasSuggestions,
    request,
    clear,
    hide: () => setIsOpen(false),
    reopen: () => {
      if (suggestions.length > 0) setIsOpen(true);
    },
  };
}
