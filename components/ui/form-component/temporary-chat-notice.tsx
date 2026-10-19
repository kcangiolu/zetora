'use client';

import { AnimatePresence, motion } from 'motion/react';

const appear = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

function Notice() {
  return (
    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-70"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>This session won&apos;t appear in your history.</span>
    </p>
  );
}

// Under the composer of a new chat. Signed-in users can toggle it, so their slot keeps
// its height to avoid a jump.
export function TemporaryChatNotice({ enabled, reserveSpace }: { enabled: boolean; reserveSpace: boolean }) {
  if (reserveSpace) {
    return (
      <div className="relative h-8">
        <AnimatePresence>
          {enabled && (
            <motion.div
              {...appear}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="absolute inset-x-0 top-0 mt-2 text-center"
            >
              <Notice />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
  if (!enabled) return null;
  return (
    <motion.div {...appear} className="mt-2 text-center">
      <Notice />
    </motion.div>
  );
}
