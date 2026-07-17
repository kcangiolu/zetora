'use client';

import { motion } from 'motion/react';
import { TextShimmer } from '@/components/core/text-shimmer';
import { ZetoraLogo } from '@/components/logos/zetora-logo';

export function StreamingIndicator({ label = 'Thinking…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 ml-8 mt-2">
      <motion.span
        className="size-8 text-muted-foreground"
        animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ZetoraLogo className="w-full h-full" />
      </motion.span>
      <TextShimmer className="text-sm" duration={1.8}>
        {label}
      </TextShimmer>
    </div>
  );
}
