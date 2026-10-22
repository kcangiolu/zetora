'use client';

import React from 'react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { Card } from '@/components/ui/card';
import type { Lookout } from '@/hooks/use-lookouts';
import { LookoutCard } from './lookout-card';

type CardHandlers = Omit<React.ComponentProps<typeof LookoutCard>, 'lookout'>;

interface LookoutGridProps extends CardHandlers {
  lookouts: Lookout[];
  /** Shown after the cards, such as the "new lookout" card. */
  children?: React.ReactNode;
}

export function LookoutGrid({ lookouts, children, ...cardProps }: LookoutGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {lookouts.map((lookout) => (
        <LookoutCard key={lookout.id} lookout={lookout} {...cardProps} />
      ))}
      {children}
    </div>
  );
}

// A dashed card that opens the create form.
export function NewLookoutCard({ onClick }: { onClick: () => void }) {
  return (
    <Card
      className="shadow-none cursor-pointer border-dashed border border-border/60 hover:border-primary/40 transition-all duration-200 flex items-center justify-center h-full min-h-[200px] group rounded-xl"
      onClick={onClick}
    >
      <div className="flex flex-col items-center gap-2.5 text-muted-foreground group-hover:text-primary transition-colors">
        <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          <HugeiconsIcon icon={PlusSignIcon} size={18} color="currentColor" strokeWidth={1.5} />
        </div>
        <span className="font-pixel text-[10px] uppercase tracking-wider">New lookout</span>
      </div>
    </Card>
  );
}
