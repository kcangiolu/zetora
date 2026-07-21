'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  getExtensionModeUIs,
  subscribeExtensionModeUIs,
  type ExtensionModeUIDescriptor,
} from '@/lib/extension-modes-client';

// Generic capability an extension-registered chat mode can opt into by
// supplying an `accent: { palette }` in its UI descriptor (see
// lib/extension-modes-client.ts) — the core ships the mechanism (CSS in
// app/globals.css: .mode-accent-border, .mode-accent-spread) and knows
// nothing about which mode uses it or what its colors mean.
function useActiveAccent(selectedGroup: string): ExtensionModeUIDescriptor | undefined {
  const [descriptors, setDescriptors] = useState(() => getExtensionModeUIs());
  useEffect(() => subscribeExtensionModeUIs(() => setDescriptors(getExtensionModeUIs())), []);
  return descriptors.find((d) => d.id === selectedGroup && d.accent);
}

// CSS vars (--accent-c1..c5) for the currently active mode's palette —
// spread onto the same element that gets the `mode-accent-border` class
// (app/globals.css handles the rotating conic-gradient border from there).
// undefined when the active mode has no accent palette: apply nothing.
export function useModeAccentStyle(selectedGroup: string): CSSProperties | undefined {
  const active = useActiveAccent(selectedGroup);
  if (!active?.accent) return undefined;
  return Object.fromEntries(
    active.accent.palette.slice(0, 5).map((color, i) => [`--accent-c${i + 1}`, color]),
  ) as CSSProperties;
}

// One-shot pulse that spreads outward the moment selectedGroup switches TO
// an accented mode. Mount inside the same relatively-positioned wrapper
// that has useModeAccentStyle's style + the mode-accent-border class.
export function ModeAccentSpread({ selectedGroup }: { selectedGroup: string }) {
  const active = useActiveAccent(selectedGroup);
  const previousGroupRef = useRef(selectedGroup);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    const previousGroup = previousGroupRef.current;
    previousGroupRef.current = selectedGroup;
    if (active && previousGroup !== selectedGroup) {
      setPlay(true);
      const timeout = setTimeout(() => setPlay(false), 900);
      return () => clearTimeout(timeout);
    }
  }, [selectedGroup, active]);

  return (
    <AnimatePresence>
      {play && (
        <motion.div
          key="mode-accent-spread"
          className="mode-accent-spread"
          exit={{ opacity: 0 }}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  );
}
