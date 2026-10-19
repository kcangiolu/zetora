'use client';

import { MagnifyingGlassIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

// Suggestions under the input, the typed prefix plain and the completion in bold.
export function AutocompleteList({
  suggestions,
  query,
  highlightedIndex,
  onHighlight,
  onPick,
}: {
  suggestions: string[];
  query: string;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onPick: (suggestion: string) => void;
}) {
  const prefix = query.trim().toLowerCase();
  return (
    <div className="absolute -left-px -right-px top-full z-50 bg-muted border border-ring/5 border-t-0 rounded-b-xl overflow-hidden">
      {suggestions.map((suggestion, index) => {
        const matchEnd = suggestion.toLowerCase().startsWith(prefix) ? prefix.length : 0;
        return (
          <button
            key={suggestion}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(suggestion);
            }}
            onMouseEnter={() => onHighlight(index)}
            className={cn(
              'flex items-center gap-2.5 w-full px-4 py-1.5 text-left transition-colors duration-75',
              index === highlightedIndex ? 'bg-accent/60' : 'bg-transparent hover:bg-accent/30',
            )}
          >
            <MagnifyingGlassIcon className="size-3.5 shrink-0 text-muted-foreground/60" weight="bold" />
            <span className="text-[13px] text-foreground/80 truncate">
              {matchEnd > 0 ? (
                <>
                  {suggestion.slice(0, matchEnd)}
                  <span className="font-semibold text-foreground">{suggestion.slice(matchEnd)}</span>
                </>
              ) : (
                suggestion
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
