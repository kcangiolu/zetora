'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImageCompareSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeAlt?: string;
  afterAlt?: string;
  className?: string;
};

const STEP = 2;

// Custom drag handling instead of @radix-ui/react-slider: the value only
// ever comes from clientX, deliberately ignoring clientY, so dragging up/down
// can never nudge the compare position — the axis-mixing users perceived
// when dragging diagonally with the generic Slider is now impossible by
// construction.
export function ImageCompareSlider({ beforeUrl, afterUrl, beforeAlt, afterAlt, className }: ImageCompareSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromClientX(event.clientX);
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - STEP));
    else if (event.key === 'ArrowRight') setPosition((p) => Math.min(100, p + STEP));
    else if (event.key === 'Home') setPosition(0);
    else if (event.key === 'End') setPosition(100);
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Comparer avant/après"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={handleKeyDown}
      className={cn(
        'group/compare relative flex w-full touch-pan-y items-center select-none outline-none cursor-ew-resize',
        className,
      )}
    >
      <img
        src={afterUrl}
        alt={afterAlt || 'After'}
        className="block w-full h-auto pointer-events-none"
        draggable={false}
      />
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
      <div
        className="pointer-events-none absolute flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-md"
        style={{ left: `${position}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <ChevronLeft className="size-3 -mr-1 text-muted-foreground" />
        <ChevronRight className="size-3 -ml-1 text-muted-foreground" />
      </div>
    </div>
  );
}
