/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImageCompareSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeAlt?: string;
  afterAlt?: string;
  className?: string;
};

export function ImageCompareSlider({ beforeUrl, afterUrl, beforeAlt, afterAlt, className }: ImageCompareSliderProps) {
  const [position, setPosition] = useState(50);

  return (
    <SliderPrimitive.Root
      value={[position]}
      onValueChange={(vals) => setPosition(vals[0])}
      min={0}
      max={100}
      step={0.1}
      className={cn('group/compare relative flex w-full touch-none items-center select-none', className)}
    >
      <img src={afterUrl} alt={afterAlt || 'After'} className="block w-full h-auto pointer-events-none" draggable={false} />
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={beforeUrl} alt={beforeAlt || 'Before'} className="block w-full h-auto" draggable={false} />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-background/80 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
        style={{ left: `${position}%` }}
      />
      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/70 px-2 py-0.5 text-xs font-medium text-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover/compare:opacity-100">
        Avant
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/70 px-2 py-0.5 text-xs font-medium text-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover/compare:opacity-100">
        Après
      </span>
      <SliderPrimitive.Thumb
        className="relative flex h-0 w-0 items-center justify-center focus-visible:outline-none"
        aria-label="Comparer avant/après"
      >
        <div className="absolute flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-md cursor-ew-resize">
          <ChevronLeft className="size-3 -mr-1 text-muted-foreground" />
          <ChevronRight className="size-3 -ml-1 text-muted-foreground" />
        </div>
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
}
