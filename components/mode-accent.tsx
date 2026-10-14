'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// Colored border + one-shot activation pulse for the Agent mode (backed by
// Hermes, see lib/hermes/). Only this mode gets an accent, so there is no
// registry. CSS lives in app/globals.css (.mode-accent-border /
// .mode-accent-spread), driven by the --accent-c1..c5 vars below.
const AGENT_MODE_ID = 'hermes';

const AGENT_ACCENT_PALETTE = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'];

// CSS vars for the currently active mode's palette — spread onto the same
// element that gets the `mode-accent-border` class (app/globals.css handles
// the rotating conic-gradient border from there). undefined when the active
// mode isn't the Agent mode: apply nothing.
export function useModeAccentStyle(selectedGroup: string): CSSProperties | undefined {
  if (selectedGroup !== AGENT_MODE_ID) return undefined;
  return Object.fromEntries(AGENT_ACCENT_PALETTE.map((color, i) => [`--accent-c${i + 1}`, color])) as CSSProperties;
}

// One-shot pulse that spreads outward the moment selectedGroup switches TO
// the Agent mode. Mount inside the same relatively-positioned wrapper that
// has useModeAccentStyle's style + the mode-accent-border class.
export function ModeAccentSpread({ selectedGroup }: { selectedGroup: string }) {
  const isActive = selectedGroup === AGENT_MODE_ID;
  const previousGroupRef = useRef(selectedGroup);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    const previousGroup = previousGroupRef.current;
    previousGroupRef.current = selectedGroup;
    if (isActive && previousGroup !== selectedGroup) {
      setPlay(true);
      const timeout = setTimeout(() => setPlay(false), 900);
      return () => clearTimeout(timeout);
    }
  }, [selectedGroup, isActive]);

  return (
    <AnimatePresence>
      {play && (
        <motion.div key="mode-accent-spread" className="mode-accent-spread" exit={{ opacity: 0 }} aria-hidden="true" />
      )}
    </AnimatePresence>
  );
}
