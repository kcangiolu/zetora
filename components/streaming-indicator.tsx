'use client';

import { motion, useReducedMotion } from 'motion/react';
import { TextShimmer } from '@/components/core/text-shimmer';

export function StreamingIndicator({ label = 'Thinking…' }: { label?: string }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-2 ml-8 mt-2">
      {prefersReducedMotion ? (
        <span className="w-2 h-2 rounded-full bg-muted-foreground opacity-70" />
      ) : (
        <motion.span
          className="w-2 h-2 rounded-full bg-muted-foreground"
          animate={{ scale: [1, 1.25, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <TextShimmer className="text-sm" duration={1.8}>
        {label}
      </TextShimmer>
    </div>
  );
}
