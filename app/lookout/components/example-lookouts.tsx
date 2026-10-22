'use client';

import React from 'react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { ShuffleIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { allExampleLookouts, getRandomExamples, LOOKOUT_SEARCH_MODES } from '../constants';
import { formatFrequency } from '../utils/time-utils';

type LookoutExample = (typeof allExampleLookouts)[number];

// Three examples picked at random, and a dialog listing them all by search mode.
export function ExampleLookouts({ onUseExample }: { onUseExample: (example: LookoutExample) => void }) {
  const [randomExamples, setRandomExamples] = React.useState(() => getRandomExamples(3));
  const [isAllExamplesOpen, setIsAllExamplesOpen] = React.useState(false);
  const [selectedModeFilter, setSelectedModeFilter] = React.useState<string | null>(null);

  const filteredExamples = selectedModeFilter
    ? allExampleLookouts.filter((example) => example.searchMode === selectedModeFilter)
    : allExampleLookouts;

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Examples</h2>
          <span className="font-pixel text-[9px] text-muted-foreground/50 uppercase tracking-wider">
            {allExampleLookouts.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRandomExamples(getRandomExamples(3))}
            title="Shuffle examples"
          >
            <HugeiconsIcon icon={ShuffleIcon} size={14} color="currentColor" strokeWidth={1.5} />
          </Button>
          <Dialog open={isAllExamplesOpen} onOpenChange={setIsAllExamplesOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={ViewIcon} size={14} color="currentColor" strokeWidth={1.5} className="mr-1.5" />
                View All
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-lg">All Example Lookouts</DialogTitle>
              </DialogHeader>

              {/* Mode Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 pb-4 border-b border-border/40">
                <Button
                  variant={selectedModeFilter === null ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedModeFilter(null)}
                >
                  All{' '}
                  <span className="font-pixel text-[8px] text-inherit/70 ml-1 uppercase">
                    {allExampleLookouts.length}
                  </span>
                </Button>
                {LOOKOUT_SEARCH_MODES.map((mode) => {
                  const count = allExampleLookouts.filter((e) => e.searchMode === mode.value).length;
                  if (count === 0) return null;
                  return (
                    <Button
                      key={mode.value}
                      variant={selectedModeFilter === mode.value ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelectedModeFilter(mode.value)}
                    >
                      <HugeiconsIcon
                        icon={mode.icon}
                        size={12}
                        color="currentColor"
                        strokeWidth={1.5}
                        className="mr-1"
                      />
                      {mode.label} <span className="font-pixel text-[8px] text-inherit/70 ml-1 uppercase">{count}</span>
                    </Button>
                  );
                })}
              </div>

              {/* Examples Grid */}
              <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                  {filteredExamples.map((example, index) => (
                    <ExampleCard
                      key={index}
                      example={example}
                      compact
                      onClick={() => {
                        onUseExample(example);
                        setIsAllExamplesOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-hidden">
        {randomExamples.map((example, index) => (
          <ExampleCard key={index} example={example} onClick={() => onUseExample(example)} />
        ))}
      </div>
    </div>
  );
}

// One example: compact in the "all examples" dialog, with a tinted prompt panel on the page.
function ExampleCard({
  example,
  compact = false,
  onClick,
}: {
  example: LookoutExample;
  compact?: boolean;
  onClick: () => void;
}) {
  const modeConfig = LOOKOUT_SEARCH_MODES.find((m) => m.value === example.searchMode);
  const modeBadge = modeConfig && (
    <span className="flex items-center gap-1 font-pixel text-[9px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wider">
      <HugeiconsIcon icon={modeConfig.icon} size={10} color="currentColor" strokeWidth={1.5} />
      {modeConfig.label}
    </span>
  );
  const frequency = (
    <p className="font-pixel text-[9px] text-muted-foreground/50 uppercase tracking-wider">
      {formatFrequency(example.frequency, example.time, example.dayOfWeek)}
    </p>
  );

  if (compact) {
    return (
      <Card
        className="cursor-pointer transition-all duration-200 group border hover:border-primary/30 shadow-none"
        onClick={onClick}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1">
              {example.title}
            </CardTitle>
            {modeBadge}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{example.prompt.slice(0, 120)}...</p>
          {frequency}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer transition-all duration-200 group pb-0! mb-0! max-h-96 h-full border hover:border-primary/30 shadow-none"
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium group-hover:text-primary transition-colors">
            {example.title}
          </CardTitle>
          {modeBadge}
        </div>
      </CardHeader>
      <CardContent className="bg-accent/50 border mb-0! sm:-mb-1! border-accent rounded-t-lg mx-3 p-4 grow h-28 sm:h-28 group-hover:bg-accent/70 group-hover:border-primary/20 transition-all duration-200">
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{example.prompt.slice(0, 100)}...</p>
        {frequency}
      </CardContent>
    </Card>
  );
}
