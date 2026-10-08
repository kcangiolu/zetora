'use client';

import { useEffect, useState } from 'react';
import { Brain } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getReasoningControl, type Model } from '@/ai/models';
import {
  REASONING_EFFORT_LEVELS,
  type ReasoningEffort,
  type ReasoningCapability,
} from '@/lib/reasoning-effort-types';

const EFFORT_LABEL: Record<ReasoningEffort, string> = {
  auto: 'Auto',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  off: 'Off',
};

// The three non-'full' capabilities all render the same binary show/hide
// button — they differ only in how honestly they can describe what it does.
const BINARY_CAPABILITY_TOOLTIP: Record<'binary-guaranteed' | 'best-effort' | 'mask-only', (hidden: boolean) => string> = {
  'binary-guaranteed': (hidden) =>
    `Reasoning ${hidden ? 'off' : 'on'} — this provider has a real on/off switch, but no distinct effort levels for this backend.`,
  'best-effort': (hidden) =>
    hidden
      ? "Reasoning off (best effort) — a real disable signal is sent, but whether it's honored depends on the model's own chat template, so it isn't guaranteed."
      : "Reasoning on — no distinct effort levels are guaranteed for this backend, and turning this off is a best-effort attempt, not a guarantee.",
  'mask-only': (hidden) =>
    `Reasoning ${hidden ? 'hidden' : 'shown'} — this provider doesn't support reasoning-effort control, this toggle only shows or hides the model's thinking output.`,
};

// Shown next to the model picker: a full effort selector when the current
// model/provider accepts a real control parameter, or a plain show/hide
// switch when it can only mask the <think> output after the fact. Hidden
// entirely for models that don't reason at all.
export function ReasoningEffortToggle({
  selectedModel,
  value,
  onChange,
  // When the caller already has the custom-models list at hand (e.g.
  // Settings' TertiaryModelRow, which fetches it once for the whole page),
  // pass it in to skip this component's own fetch. The composer doesn't have
  // it handy, so it falls back to fetching independently.
  customModels,
}: {
  selectedModel: string;
  value: ReasoningEffort;
  onChange: (value: ReasoningEffort) => void;
  customModels?: Model[];
}) {
  const [fetchedCapability, setFetchedCapability] = useState<ReasoningCapability>(null);

  useEffect(() => {
    if (customModels || !selectedModel.startsWith('custom-')) return;
    let cancelled = false;
    fetch('/api/custom-providers/models')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !Array.isArray(d.models)) return;
        const match = d.models.find((m: { value: string; reasoningControl?: ReasoningCapability }) => {
          return m.value === selectedModel;
        });
        setFetchedCapability(match?.reasoningControl ?? 'mask-only');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedModel, customModels]);

  const capability: ReasoningCapability = selectedModel.startsWith('custom-')
    ? (customModels
        ? (customModels.find((m) => m.value === selectedModel)?.reasoningControl ?? 'mask-only')
        : fetchedCapability)
    : getReasoningControl(selectedModel);

  if (!capability) return null;

  if (capability === 'binary-guaranteed' || capability === 'best-effort' || capability === 'mask-only') {
    const hidden = value === 'off';
    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'rounded-full size-8! text-muted-foreground hover:text-foreground transition-colors',
              !hidden && 'text-primary hover:text-primary',
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(hidden ? 'auto' : 'off');
            }}
          >
            <Brain size={16} weight={hidden ? 'regular' : 'fill'} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="max-w-[220px]">
          <span className="font-medium text-[11px]">{BINARY_CAPABILITY_TOOLTIP[capability](hidden)}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'rounded-full size-8! text-muted-foreground hover:text-foreground transition-colors',
                value !== 'auto' && 'text-primary hover:text-primary',
              )}
            >
              <Brain size={16} weight={value !== 'auto' ? 'fill' : 'regular'} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          <span className="font-medium text-[11px]">Reasoning effort: {EFFORT_LABEL[value]}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" side="bottom" sideOffset={6} className="w-36 p-1 rounded-lg">
        {REASONING_EFFORT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={cn(
              'flex w-full items-center rounded-md px-2.5 py-1.5 text-xs hover:bg-accent transition-colors',
              value === level && 'bg-accent font-medium',
            )}
            onClick={() => onChange(level)}
          >
            {EFFORT_LABEL[level]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
