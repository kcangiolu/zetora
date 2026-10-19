'use client';

import { X } from 'lucide-react';

import { FlexibleIcon } from '@/components/ui/flexible-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type SearchGroup } from '@/lib/search/search-groups';

// The forced mode next to the "+" button. Clicking it opens the menu to switch, its ✕
// clears it; a chat committed to the Agent shows the badge locked.
export function ActiveModeBadge({
  group,
  isLocked,
  onSwitch,
  onClear,
}: {
  group: SearchGroup;
  isLocked: boolean;
  onSwitch: () => void;
  onClear: () => void;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'group relative flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-primary/8! text-primary/80 border border-primary/15 text-[12px] font-medium hover:bg-primary/12 hover:text-primary transition-colors',
            isLocked ? 'cursor-default' : 'cursor-pointer',
          )}
          onClick={() => {
            if (!isLocked) onSwitch();
          }}
        >
          <div className="relative size-3.5">
            <FlexibleIcon
              icon={group.icon}
              size={14}
              color="currentColor"
              strokeWidth={1.5}
              className={cn('absolute inset-0 transition-opacity', !isLocked && 'group-hover:opacity-0')}
            />
            {!isLocked && (
              <button
                className="absolute -inset-0.5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-foreground/10 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                aria-label="Clear mode"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
          <span>{group.name}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-[11px]">
            {isLocked ? 'Locked to this conversation' : 'Click to switch mode'}
          </span>
          {!isLocked && <span className="text-[10px] text-background/50">Hover ✕ to clear</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
