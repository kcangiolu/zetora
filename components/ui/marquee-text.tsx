'use client';

import React, { useRef, useState, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';

export function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measureEl = measureRef.current;
    if (!container || !measureEl) return;
    const measure = () => {
      setScrollOffset(Math.max(0, measureEl.offsetWidth - container.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text]);

  const duration = Math.max(2, scrollOffset / 40);

  return (
    <>
      {/* Off-screen clone to measure the natural text width */}
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          whiteSpace: 'nowrap',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {text}
      </span>

      <div
        ref={containerRef}
        className={cn('overflow-hidden', scrollOffset > 0 && 'marquee-container', className)}
        style={
          scrollOffset > 0
            ? ({ '--marquee-duration': `${duration}s`, '--marquee-offset': `-${scrollOffset}px` } as React.CSSProperties)
            : undefined
        }
      >
        <span className="marquee-text whitespace-nowrap">{text}</span>
      </div>
    </>
  );
}
