'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { getSearchGroups, cn } from '@/lib/utils';
import { models, PROVIDERS, getModelProvider, type ModelProvider } from '@/ai/models';
import { Search } from 'lucide-react';
import { useMemo, useState, type ComponentType } from 'react';
import { SOURCE_CATALOG_IDS } from './shared';

export function CustomizeTab() {
  // Own instance of the chat search provider (read-only here) — kept in sync
  // with the Search tab's instance via useSyncedPreferences' CustomEvent.
  const [searchProvider] = useSyncedPreferences<'exa' | 'parallel' | 'firecrawl' | 'searxng' | 'fastcrw'>(
    'zetora-search-provider',
    'exa',
  );

  // Customize state: enabled sources and preferred models
  const dynamicGroups = useMemo(() => getSearchGroups(searchProvider), [searchProvider]);
  const [visibleModesLegacy] = useSyncedPreferences<string[]>('zetora-visible-modes', []);
  const [enabledSourcesPref, setEnabledSources] = useSyncedPreferences<string[]>('zetora-enabled-sources', []);
  // Fall back to the pre-migration key so existing curation isn't silently reset to "all enabled".
  const enabledSources =
    enabledSourcesPref.length > 0
      ? enabledSourcesPref
      : visibleModesLegacy.filter((id) => SOURCE_CATALOG_IDS.includes(id));
  const [preferredModels, setPreferredModels] = useSyncedPreferences<string[]>('zetora-preferred-models', []);

  const sourceCatalog = useMemo(
    () => SOURCE_CATALOG_IDS.map((id) => dynamicGroups.find((g) => g.id === id)).filter((g) => Boolean(g)),
    [dynamicGroups],
  );

  const [modelSearch, setModelSearch] = useState('');

  // Group models by provider for the customize UI
  const modelsByProvider = useMemo(() => {
    const groups = new Map<ModelProvider, typeof models>();
    for (const m of models) {
      const provider = m.provider || getModelProvider(m.value, m.label);
      if (!groups.has(provider)) groups.set(provider, []);
      groups.get(provider)!.push(m);
    }
    return groups;
  }, []);

  const filteredModelsByProvider = useMemo(() => {
    if (!modelSearch.trim()) return modelsByProvider;
    const q = modelSearch.toLowerCase();
    const filtered = new Map<ModelProvider, typeof models>();
    for (const [provider, providerModels] of modelsByProvider) {
      const matching = providerModels.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.value.toLowerCase().includes(q),
      );
      if (matching.length > 0) filtered.set(provider, matching);
    }
    return filtered;
  }, [modelsByProvider, modelSearch]);

  return (
    <div className="mt-4 space-y-5">
      {/* Sources - toggle which tools the model can use */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Sources</p>
            <p className="text-[11px] text-muted-foreground/50">
              Tools the AI can use on every message. All enabled when none selected.
            </p>
          </div>
          {enabledSources.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 rounded-md"
              onClick={() => setEnabledSources([])}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20">
          {sourceCatalog.map((group) => {
            if (!group) return null;
            const isEnabled = enabledSources.length === 0 || enabledSources.includes(group.id);
            const GroupIcon = group.icon as unknown as ComponentType<{
              width?: number;
              height?: number;
              className?: string;
            }>;
            const isComponentIcon = typeof group.icon === 'function';
            return (
              <div key={group.id} className="flex items-center justify-between py-2.5 px-3 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isComponentIcon ? (
                    <GroupIcon width={14} height={14} className="shrink-0 text-muted-foreground" />
                  ) : (
                    <HugeiconsIcon
                      icon={group.icon as any}
                      size={14}
                      color="currentColor"
                      className="shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="text-xs font-medium truncate">{group.name}</span>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => {
                    const base = enabledSources.length === 0 ? sourceCatalog.map((g) => g!.id) : enabledSources;
                    if (checked) {
                      setEnabledSources([...base, group.id]);
                    } else {
                      const next = base.filter((id) => id !== group.id);
                      setEnabledSources(next);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Models - select preferred */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Preferred Models</p>
            <p className="text-[11px] text-muted-foreground/50">
              Select models to show in the picker. All shown when none selected.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {preferredModels.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 rounded-md"
                onClick={() => setPreferredModels([])}
              >
                Clear ({preferredModels.length})
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search models..."
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            className="h-8 text-xs rounded-lg pl-8"
          />
        </div>

        {/* Scrollable model list grouped by provider */}
        <div className="rounded-xl border border-border/60 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20">
          {Array.from(filteredModelsByProvider.entries()).map(([provider, providerModels]) => (
            <div key={provider}>
              {/* Provider header */}
              <div className="sticky top-0 bg-background/95 backdrop-blur px-4 py-2 border-b border-border/30">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {PROVIDERS[provider]?.name || provider}
                  <span className="text-muted-foreground/40 ml-1.5 font-normal normal-case tracking-normal">
                    {providerModels.filter((m) => preferredModels.includes(m.value)).length > 0 &&
                      `${providerModels.filter((m) => preferredModels.includes(m.value)).length} selected`}
                  </span>
                </p>
              </div>
              {/* Model rows */}
              <div className="divide-y divide-border/30">
                {providerModels.map((m) => {
                  const isSelected = preferredModels.includes(m.value);
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          const next = preferredModels.filter((id) => id !== m.value);
                          setPreferredModels(next);
                        } else {
                          setPreferredModels([...preferredModels, m.value]);
                        }
                      }}
                      className={cn(
                        'w-full flex items-center justify-between py-2 px-4 gap-4 text-left transition-colors',
                        'hover:bg-accent/40',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{m.label}</span>
                          {m.pro && (
                            <span className="font-pixel text-[11px] text-muted-foreground/50 uppercase tracking-wider shrink-0">
                              Pro
                            </span>
                          )}
                          {m.isNew && (
                            <span className="text-[7px] bg-primary/10 text-primary px-1 py-0.5 rounded font-medium shrink-0">
                              New
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                          isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border/60',
                        )}
                      >
                        {isSelected && (
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredModelsByProvider.size === 0 && (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground">No models match your search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
