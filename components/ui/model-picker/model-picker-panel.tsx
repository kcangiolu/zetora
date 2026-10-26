'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Brain, FilePdf } from '@phosphor-icons/react';
import { Check, ChevronDown, Search, Star } from 'lucide-react';
import { useWebHaptics } from 'web-haptics/react';

import { AUTO_MODEL_ID, PROVIDER_ORDER, canonicalModelId, getProviderName, type Model } from '@/ai/models';
import { MagicWandIcon } from '@/components/ui/magic-wand-icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { cn } from '@/lib/utils';
import { ProviderIcon } from './provider-icon';

// The provider tabs, search box and model list shared by the chat's model
// switcher and the settings' model selectors. It is mounted each time the
// picker opens, so the search and the tab start fresh.

const ALL_TAB = 'all';

// Each custom provider gets its own tab ('custom:<id>') instead of one shared
// 'custom' tab.
function getGroupKey(model: Model): string {
  return model.provider === 'custom' && model.customProviderId ? `custom:${model.customProviderId}` : model.provider;
}

// Brings `item` into view by scrolling `container` alone. scrollIntoView would
// also scroll every scrollable ancestor, the window included: in an iOS home
// screen app, where the drawer leaves the page scrollable behind it, that moves
// the page under the open picker and the taps on it get lost.
function scrollWithin(container: HTMLElement, item: HTMLElement, behavior: ScrollBehavior) {
  const box = container.getBoundingClientRect();
  const target = item.getBoundingClientRect();
  const offset = (start: number, end: number, boxStart: number, boxEnd: number) =>
    start < boxStart ? start - boxStart : end > boxEnd ? end - boxEnd : 0;
  const top = offset(target.top, target.bottom, box.top, box.bottom);
  const left = offset(target.left, target.right, box.left, box.right);
  if (top || left) container.scrollBy({ top, left, behavior });
}

function groupIconProvider(groupKey: string): string {
  return groupKey.startsWith('custom:') ? 'custom' : groupKey;
}

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Favorites first, then new models, each group in catalog order.
function sortForList(models: Model[], favorites: Set<string>): Model[] {
  const favorite: Model[] = [];
  const fresh: Model[] = [];
  const rest: Model[] = [];
  for (const model of models) {
    if (favorites.has(model.value)) favorite.push(model);
    else if (model.isNew) fresh.push(model);
    else rest.push(model);
  }
  return [...favorite, ...fresh, ...rest];
}

function searchText(model: Model): string {
  return [
    model.label,
    model.description,
    getProviderName(model.provider),
    model.value,
    model.vision ? 'vision' : '',
    model.reasoning ? 'reasoning' : '',
    model.pdf ? 'pdf' : '',
    model.experimental ? 'experimental' : '',
    model.isNew ? 'new' : '',
  ].join(' ');
}

// Ranks every model against the query: a whole-query match counts most,
// then label matches, then single words; ties go to favorites, new models,
// exact and prefix label matches, then alphabetical order.
function rankModels(models: Model[], query: string, favorites: Set<string>): Model[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];
  const tokens = Array.from(new Set(normalizedQuery.split(/\s+/)));

  const scored = models
    .map((model) => {
      const text = normalizeText(searchText(model));
      const label = normalizeText(model.label);
      let score = 0;
      if (text.includes(normalizedQuery)) {
        score += 5;
        if (label.includes(normalizedQuery)) score += 5;
        if (label.startsWith(normalizedQuery)) score += 3;
      }
      for (const token of tokens) {
        if (label.includes(token)) score += 3;
        else if (text.includes(token)) score += 1;
      }
      return { model, label, score };
    })
    .filter((entry) => entry.score > 0);

  const flag = (value: boolean) => (value ? 1 : 0);
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      flag(favorites.has(b.model.value)) - flag(favorites.has(a.model.value)) ||
      flag(Boolean(b.model.isNew)) - flag(Boolean(a.model.isNew)) ||
      flag(b.label === normalizedQuery) - flag(a.label === normalizedQuery) ||
      flag(b.label.startsWith(normalizedQuery)) - flag(a.label.startsWith(normalizedQuery)) ||
      a.model.label.localeCompare(b.model.label),
  );
  return scored.map((entry) => entry.model);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="bg-primary/80 text-primary-foreground rounded px-px">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function NewModelSparkle() {
  return (
    <svg
      className="absolute -top-1.5 -right-1.5 size-2.5 text-amber-500 dark:text-amber-400"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M6 5.5C6 5.224 5.776 5 5.5 5s-.5.224-.5.5c0 .98-.217 1.573-.572 1.928C4.073 7.783 3.48 8 2.5 8c-.276 0-.5.224-.5.5s.224.5.5.5c.98 0 1.573.217 1.928.572C4.783 9.927 5 10.52 5 11.5c0 .276.224.5.5.5s.5-.224.5-.5c0-.98.217-1.573.572-1.928C6.927 9.217 7.52 9 8.5 9c.276 0 .5-.224.5-.5S8.776 8 8.5 8c-.98 0-1.573-.217-1.928-.572C6.217 7.073 6 6.48 6 5.5Z"
        fill="currentColor"
      />
      <path
        d="M11 1.5c0-.276-.224-.5-.5-.5s-.5.224-.5.5c0 .633-.141.975-.333 1.167-.192.192-.534.333-1.167.333-.276 0-.5.224-.5.5s.224.5.5.5c.633 0 .975.141 1.167.333.192.192.333.534.333 1.167 0 .276.224.5.5.5s.5-.224.5-.5c0-.633.141-.975.333-1.167.192-.192.534-.333 1.167-.333.276 0 .5-.224.5-.5s-.224-.5-.5-.5c-.633 0-.975-.141-1.167-.333C11.141 2.475 11 2.133 11 1.5Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M21 15c-5.556 0-8-2.444-8-8 0 5.556-2.444 8-8 8 5.556 0 8 2.444 8 8 0-5.556 2.444-8 8-8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CapabilityIcon({ label, icon: Icon, isMobile }: { label: string; icon: typeof Eye; isMobile: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('p-0.5 rounded', isMobile && 'p-1')}>
          <Icon className={cn('text-muted-foreground/50', isMobile ? 'size-3' : 'size-2.5')} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface ModelPickerPanelProps {
  // The models that can be picked here.
  models: Model[];
  selectedModel: string;
  onSelect: (model: Model) => void;
  // Unique per picker on the page, for the listbox and option ids.
  idPrefix: string;
}

export function ModelPickerPanel({ models, selectedModel, onSelect, idPrefix }: ModelPickerPanelProps) {
  const isMobile = useIsMobile();
  const haptics = useWebHaptics();
  const providerSidebarRef = useRef<HTMLDivElement>(null);
  const modelListRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState(ALL_TAB);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  // Favorites: shown first, and the only models on the 'all' tab when there
  // are any. Stored ids may predate the current catalog ids.
  const [storedPreferredModels, setPreferredModels] = useSyncedPreferences<string[]>('zetora-preferred-models', []);
  const preferredModels = useMemo(() => storedPreferredModels.map(canonicalModelId), [storedPreferredModels]);
  const favorites = useMemo(() => new Set(preferredModels), [preferredModels]);

  const toggleFavorite = (modelValue: string) => {
    setPreferredModels(
      favorites.has(modelValue) ? preferredModels.filter((id) => id !== modelValue) : [...preferredModels, modelValue],
    );
  };

  const customGroupNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const model of models) {
      if (model.provider === 'custom' && model.customProviderId && model.customProviderName) {
        names.set(`custom:${model.customProviderId}`, model.customProviderName);
      }
    }
    return names;
  }, [models]);
  const groupLabel = (key: string) => customGroupNames.get(key) ?? getProviderName(key);

  // Every listed model is reachable (the catalog only holds configured
  // routes), so each provider with models gets a tab: labs in their usual
  // order, then custom providers by name.
  const tabs = useMemo(() => {
    const groups = new Set(models.map(getGroupKey));
    const labs = PROVIDER_ORDER.filter((provider) => groups.has(provider));
    const custom = Array.from(groups)
      .filter((group) => group.startsWith('custom:'))
      .sort((a, b) => (customGroupNames.get(a) ?? a).localeCompare(customGroupNames.get(b) ?? b));
    return [ALL_TAB, ...labs, ...custom];
  }, [models, customGroupNames]);

  const allTabModels = useMemo(
    () => (favorites.size > 0 ? models.filter((model) => favorites.has(model.value)) : models),
    [models, favorites],
  );

  const tabModelCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL_TAB]: allTabModels.length };
    for (const model of models) {
      const key = getGroupKey(model);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [models, allTabModels]);

  const tabsWithNewModels = useMemo(() => new Set(models.filter((model) => model.isNew).map(getGroupKey)), [models]);

  // A search looks through every model, whatever the tab.
  const isSearching = searchQuery.trim().length > 0;
  const displayModels = useMemo(() => {
    if (isSearching) return rankModels(models, searchQuery, favorites);
    const tabModels =
      selectedTab === ALL_TAB ? allTabModels : models.filter((model) => getGroupKey(model) === selectedTab);
    return sortForList(tabModels, favorites);
  }, [isSearching, models, searchQuery, favorites, selectedTab, allTabModels]);

  // Starts on the selected model; moves back to the top when the list changes.
  const [focusedIndex, setFocusedIndex] = useState(() =>
    Math.max(
      0,
      displayModels.findIndex((model) => model.value === selectedModel),
    ),
  );
  const resetFocus = () => setFocusedIndex(-1);

  // The first scroll, on open, is instant: a tap during a smooth scroll only
  // stops the scroll and never reaches the model under the finger.
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    const list = modelListRef.current;
    if (focusedIndex < 0 || !list) return;
    const item = list.querySelectorAll<HTMLElement>('[data-model-index]')[focusedIndex];
    if (item) scrollWithin(list, item, hasScrolledRef.current ? 'smooth' : 'auto');
    hasScrolledRef.current = true;
  }, [focusedIndex]);

  const selectTab = (tab: string) => {
    haptics.trigger('selection');
    setSelectedTab(tab);
    resetFocus();
  };

  const select = useCallback(
    (model: Model) => {
      haptics.trigger('selection');
      onSelect(model);
    },
    [haptics, onSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // ArrowLeft / ArrowRight cycle through the provider tabs.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const current = tabs.indexOf(selectedTab);
      const next = e.key === 'ArrowLeft' ? (current - 1 + tabs.length) % tabs.length : (current + 1) % tabs.length;
      selectTab(tabs[next]);
      const sidebar = providerSidebarRef.current;
      const tab = sidebar?.querySelectorAll<HTMLElement>('button')[next];
      if (sidebar && tab) scrollWithin(sidebar, tab, 'smooth');
      return;
    }

    const count = displayModels.length;
    if (count === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev < count - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : count - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < count) select(displayModels[focusedIndex]);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(count - 1);
        break;
    }
  };

  const optionId = (model: Model) => `${idPrefix}-option-${model.value}`;
  const listboxId = `${idPrefix}-listbox`;
  const iconSize = isMobile ? 16 : 14;

  const renderModelCard = (model: Model, index: number) => {
    const isSelected = model.value === selectedModel;
    const isAutoRouter = model.value === AUTO_MODEL_ID;
    const isFocused = focusedIndex === index;
    const isFavorite = favorites.has(model.value);

    return (
      <div
        key={model.value}
        id={optionId(model)}
        data-model-index={index}
        role="option"
        aria-selected={isSelected}
        onClick={() => select(model)}
        onMouseEnter={() => setFocusedIndex(index)}
        className={cn(
          'group flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer',
          'transition-all duration-150',
          'hover:bg-accent/40 active:scale-[0.99]',
          isSelected && 'bg-primary/6 dark:bg-primary/8',
          isFocused && 'bg-accent/50 ring-1 ring-primary/20',
        )}
      >
        <div
          className={cn(
            'shrink-0 mt-0.5 p-1.5 rounded-md transition-colors duration-150',
            isSelected
              ? 'bg-primary/12 text-primary'
              : 'bg-secondary/60 text-foreground/70 group-hover:bg-secondary/80',
          )}
        >
          {isAutoRouter ? (
            <MagicWandIcon size={iconSize} className={cn(isMobile ? 'size-4' : 'size-3.5')} />
          ) : (
            <ProviderIcon provider={model.provider} size={iconSize} className="text-inherit!" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'font-medium truncate transition-colors duration-150',
                isMobile ? 'text-sm' : 'text-xs',
                isSelected && 'text-primary',
              )}
            >
              {isMobile ? model.label : <HighlightedText text={model.label} query={searchQuery} />}
            </span>

            {isAutoRouter && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-primary/10 text-primary leading-none">
                AUTO
              </span>
            )}
            {model.isNew && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 leading-none">
                NEW
              </span>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(model.value);
                  }}
                  className={cn(
                    'inline-flex items-center justify-center p-0.5 rounded transition-colors',
                    isFavorite ? 'text-amber-500' : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100',
                    isMobile && 'opacity-100 p-1',
                  )}
                >
                  <Star className={cn('size-3', isFavorite && 'fill-current')} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              </TooltipContent>
            </Tooltip>
          </div>

          <p
            className={cn(
              'text-muted-foreground/70 truncate mt-0.5 leading-snug',
              isMobile ? 'text-xs' : 'text-[10px]',
            )}
          >
            {model.description}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <div className="flex items-center gap-0.5">
            {model.vision && <CapabilityIcon label="Vision" icon={Eye} isMobile={isMobile} />}
            {model.reasoning && <CapabilityIcon label="Reasoning" icon={Brain} isMobile={isMobile} />}
            {model.pdf && <CapabilityIcon label="PDF Support" icon={FilePdf} isMobile={isMobile} />}
          </div>

          {isSelected && (
            <div className="size-4 rounded-full bg-primary flex items-center justify-center">
              <Check className="size-2.5 text-primary-foreground" strokeWidth={3} />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex flex-1 min-h-0', isMobile ? 'flex-col' : 'flex-row h-full')}>
        {/* Provider tabs */}
        <div
          className={cn(
            'shrink-0 border-border/50 relative',
            isMobile ? 'flex flex-row border-b' : 'flex flex-col w-10 border-r',
          )}
        >
          <div
            ref={providerSidebarRef}
            onScroll={(e) => {
              const target = e.currentTarget;
              setShowScrollIndicator(target.scrollHeight - target.scrollTop > target.clientHeight + 10);
            }}
            className={cn(
              isMobile
                ? 'flex flex-row gap-0.5 px-2 py-1.5 overflow-x-auto'
                : 'flex flex-col gap-0.5 p-1 overflow-y-auto flex-1',
            )}
          >
            {tabs.map((tab) => {
              const isAll = tab === ALL_TAB;
              const hasNew = !isAll && tabsWithNewModels.has(tab);

              return (
                <Tooltip key={tab}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => selectTab(tab)}
                      tabIndex={-1}
                      className={cn(
                        'relative flex items-center justify-center rounded-md transition-all duration-150',
                        isMobile ? 'p-2 shrink-0' : 'p-1.5 w-full',
                        selectedTab === tab
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-accent/60 text-muted-foreground/60 hover:text-foreground',
                      )}
                    >
                      <span className="relative">
                        {hasNew && (
                          <span className="absolute inset-0 -m-0.5 rounded-full bg-amber-400/15 dark:bg-amber-500/10 blur-[3px]" />
                        )}
                        {isAll ? (
                          <Star
                            className={cn(isMobile ? 'size-4' : 'size-3.5', favorites.size > 0 && 'fill-current')}
                          />
                        ) : (
                          <ProviderIcon provider={groupIconProvider(tab)} size={iconSize} />
                        )}
                        {hasNew && <NewModelSparkle />}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side={isMobile ? 'bottom' : 'left'} className="text-xs">
                    {isAll ? (favorites.size > 0 ? 'Favorites' : 'All Models') : groupLabel(tab)}
                    {hasNew ? ' (New Model!)' : ''} ({tabModelCounts[tab] ?? 0})
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {!isMobile && showScrollIndicator && (
            <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none flex items-end justify-center pb-1 transition-opacity duration-300">
              <div className="absolute inset-0 bg-linear-to-t from-background via-background/80 to-transparent" />
              <ChevronDown className="size-3 text-muted-foreground/60 relative z-10 animate-bounce" />
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 min-h-0 flex-1 overflow-hidden">
          <div className="px-2 pt-2 pb-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  resetFocus();
                }}
                onKeyDown={handleKeyDown}
                autoFocus={!isMobile}
                role="combobox"
                aria-expanded={true}
                aria-controls={listboxId}
                aria-activedescendant={
                  focusedIndex >= 0 && displayModels[focusedIndex] ? optionId(displayModels[focusedIndex]) : undefined
                }
                className={cn(
                  'w-full pl-8 pr-3 py-1.5 text-xs rounded-lg',
                  'bg-secondary/30 border border-border/40',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40',
                  'placeholder:text-muted-foreground/50',
                  'transition-[box-shadow,border-color] duration-200',
                )}
              />
            </div>
          </div>

          {selectedTab !== ALL_TAB && !isSearching && (
            <div className="mx-2 mb-1 px-2 py-1.5 flex items-center gap-2 rounded-md bg-secondary/30 shrink-0">
              <ProviderIcon provider={groupIconProvider(selectedTab)} size={13} className="text-muted-foreground/70" />
              <span className="text-[11px] font-medium text-muted-foreground">{groupLabel(selectedTab)}</span>
              <span className="text-[10px] text-muted-foreground/50 ml-auto">
                {tabModelCounts[selectedTab] ?? 0} models
              </span>
            </div>
          )}

          <div ref={modelListRef} role="listbox" id={listboxId} className="flex-1 overflow-y-auto px-1 py-0.5 min-h-0">
            {displayModels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Search className="size-5 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground/60">No models found</p>
              </div>
            ) : (
              <div className="space-y-px">
                {isSearching && (
                  <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                    Results
                  </div>
                )}
                {displayModels.map(renderModelCard)}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
