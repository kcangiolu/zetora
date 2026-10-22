'use client';

import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { BinocularsIcon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import type { Lookout } from '@/hooks/use-lookouts';
import { LookoutDetailsSidebar } from './lookout-details-sidebar';

interface LookoutDetailsPanelProps {
  lookout: Lookout;
  allLookouts: Lookout[];
  open: boolean;
  onClose: () => void;
  onLookoutChange: (lookout: Lookout) => void;
  onEditLookout: (lookout: Lookout) => void;
  onTest: (id: string) => void;
}

// The details sidebar sliding in from the right, over a backdrop that closes it.
export function LookoutDetailsPanel({
  lookout,
  allLookouts,
  open,
  onClose,
  onLookoutChange,
  onEditLookout,
  onTest,
}: LookoutDetailsPanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-300 ease-out ${
          open ? 'bg-black/10 backdrop-blur-sm opacity-100' : 'bg-black/0 backdrop-blur-0 opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-screen w-full sm:max-w-xl bg-background border-l z-50 shadow-xl transform transition-all duration-500 ease-out overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="border-b border-border/40 px-4 py-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <HugeiconsIcon
                  icon={BinocularsIcon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="text-muted-foreground"
                />
                <span className="text-sm font-semibold tracking-tight">Details</span>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
                <HugeiconsIcon icon={Cancel01Icon} size={14} color="currentColor" strokeWidth={1.5} />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <LookoutDetailsSidebar
              lookout={lookout}
              allLookouts={allLookouts}
              onLookoutChange={onLookoutChange}
              onEditLookout={onEditLookout}
              onTest={onTest}
            />
          </div>
        </div>
      </div>
    </>
  );
}
