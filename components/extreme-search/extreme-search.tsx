'use client';

import React, { memo, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, FlaskConical, Target } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import type { DataExtremeSearchPart } from '@/lib/types';
import { cn } from '@/lib/utils';

import {
  combineFileQueries,
  combineXSearches,
  deriveResearchView,
  isTimelineItemRunning,
  type ResearchPlan,
} from './research-data';
import {
  ChartsPanel,
  FilePassagesPanel,
  ResearchTabs,
  SourcesPanel,
  XPostsPanel,
  type ResearchTab,
} from './research-panels';
import { ExtremeSourcesSheet } from './shared';
import { ResearchTimeline } from './timeline';
import { useTimelineAutoScroll } from './use-timeline-auto-scroll';

const RAIL_X = { left: '-0.6rem', transform: 'translateX(-50%)' } as const;

// One row of the plan outline: a dot on the rail, joined to its neighbours.
function PlanRow({
  index,
  count,
  dot,
  children,
}: {
  index: number;
  count: number;
  dot: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="absolute rounded-full bg-card z-5"
        style={{ ...RAIL_X, top: '4px', width: '10px', height: '10px' }}
      />
      {dot}
      {index > 0 && (
        <div className="absolute bg-secondary" style={{ ...RAIL_X, top: '0', width: '2px', height: '5px' }} />
      )}
      {index < count - 1 && (
        <div
          className="absolute bg-secondary"
          style={{ ...RAIL_X, top: '13px', width: '2px', height: 'calc(100% - 9px)' }}
        />
      )}
      <div className="flex items-start gap-1.5 py-1 px-1.5 rounded-md relative">{children}</div>
    </>
  );
}

function PlanOutline({ plan }: { plan: ResearchPlan }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Target className="w-4 h-4 text-primary" />
        <h4 className="text-[13px] font-semibold text-foreground">Research Strategy</h4>
      </div>
      <div className="space-y-0.5 relative ml-3">
        {plan.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="space-y-0 relative"
          >
            <PlanRow
              index={index}
              count={plan.length}
              dot={
                <div
                  className="absolute rounded-full bg-primary transition-colors duration-300 z-10"
                  style={{ ...RAIL_X, top: '5px', width: '8px', height: '8px' }}
                />
              }
            >
              <span className="text-foreground text-[11px] min-w-0 flex-1 font-medium wrap-break-word leading-snug">
                {item.title}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded-full">
                {item.todos?.length || 0} tasks
              </span>
            </PlanRow>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function PlanSkeleton() {
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Target className="w-4 h-4 text-primary/50" />
        <h4 className="text-[13px] font-semibold text-foreground">Preparing Research Strategy</h4>
      </div>
      <div className="space-y-0.5 relative ml-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-0 relative">
            <PlanRow
              index={index}
              count={3}
              dot={
                <Skeleton
                  className="absolute rounded-full z-10"
                  style={{ ...RAIL_X, top: '5px', width: '8px', height: '8px' }}
                />
              }
            >
              <Skeleton className="w-3 h-3 rounded-full shrink-0 mt-0.5" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-12 shrink-0 rounded-full" />
            </PlanRow>
          </div>
        ))}
      </div>
    </div>
  );
}

// The deep-research card, built from the progress events the research tool streams:
// the timeline of steps while it runs, then the results in tabs.
function ExtremeSearchComponent({ annotations }: { annotations: DataExtremeSearchPart[] }) {
  const research = useMemo(() => deriveResearchView(annotations), [annotations]);
  const { isCompleted, timelineItems, sources, charts } = research;
  const xPosts = useMemo(() => combineXSearches(research.xSearches), [research.xSearches]);
  const filePassages = useMemo(() => combineFileQueries(research.fileQueries), [research.fileQueries]);

  // Steps the reader opened or closed; the others are open while they run.
  const [toggledItems, setToggledItems] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<ResearchTab>('process');
  const [resultsOpen, setResultsOpen] = useState(true);
  const [sourcesSheetOpen, setSourcesSheetOpen] = useState(false);

  const isRunning = timelineItems.some((item, index) =>
    isTimelineItemRunning(item, index === timelineItems.length - 1),
  );
  const { containerRef, contentRef, bottomRef, handleScroll, registerList } = useTimelineAutoScroll(
    timelineItems,
    isRunning,
  );

  const expandedItems = Object.fromEntries(
    timelineItems.map((timelineItem, index) => {
      const { id } = timelineItem.item;
      const open =
        toggledItems[id] ?? (!isCompleted && isTimelineItemRunning(timelineItem, index === timelineItems.length - 1));
      return [id, open];
    }),
  );
  const toggleItem = (id: string) => setToggledItems((prev) => ({ ...prev, [id]: !expandedItems[id] }));

  // A research that drew charts opens on them.
  const [openedOnCharts, setOpenedOnCharts] = useState(false);
  if (isCompleted && charts.length > 0 && !openedOnCharts) {
    setOpenedOnCharts(true);
    setActiveTab('visualizations');
  }

  const stepCount = timelineItems.filter((item) => item.kind !== 'done').length;
  const tabs = (
    <ResearchTabs
      activeTab={activeTab}
      onTabChange={setActiveTab}
      stepCount={stepCount}
      chartCount={charts.length}
      xPosts={xPosts}
      filePassages={filePassages}
      sourceCount={sources.length}
    />
  );
  const resultPanels = (
    <>
      {activeTab === 'visualizations' && charts.length > 0 && <ChartsPanel charts={charts} />}
      {activeTab === 'xsearch' && xPosts && <XPostsPanel posts={xPosts} />}
      {activeTab === 'files' && filePassages && <FilePassagesPanel passages={filePassages} />}
      {activeTab === 'sources' && sources.length > 0 && (
        <SourcesPanel sources={sources} onShowAll={() => setSourcesSheetOpen(true)} />
      )}
    </>
  );
  const sourcesSheet = sources.length > 0 && (
    <ExtremeSourcesSheet sources={sources} open={sourcesSheetOpen} onOpenChange={setSourcesSheetOpen} />
  );

  if (isCompleted) {
    return (
      <>
        <div className="border border-border rounded-xl overflow-hidden shadow-none">
          <button
            onClick={() => setResultsOpen(!resultsOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-accent/10 transition-colors duration-200 bg-background"
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <FlaskConical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground shrink-0">Research Complete</span>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                {sources.length > 0 && ` · ${sources.length} sources`}
                {charts.length > 0 && ` · ${charts.length} ${charts.length === 1 ? 'chart' : 'charts'}`}
                {xPosts && ` · ${xPosts.citations.length} posts`}
                {filePassages &&
                  ` · ${filePassages.results.length} ${filePassages.results.length === 1 ? 'file' : 'files'}`}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                resultsOpen ? 'rotate-180' : '',
              )}
            />
          </button>

          {resultsOpen && (
            <div className="border-t border-border">
              {tabs}
              {activeTab === 'process' && (
                <div className="max-h-[500px] sm:max-h-[450px] overflow-y-auto">
                  <div className="p-4">
                    <ResearchTimeline
                      items={timelineItems}
                      live={false}
                      expandedItems={expandedItems}
                      onToggleItem={toggleItem}
                    />
                  </div>
                </div>
              )}
              {resultPanels}
            </div>
          )}
        </div>
        {sourcesSheet}
      </>
    );
  }

  return (
    <>
      <div className="border border-border rounded-xl overflow-hidden shadow-none">
        {tabs}
        {activeTab === 'process' && (
          <div>
            <div className="py-2 px-4 border-b border-border bg-background">
              <div className="text-sm font-medium text-foreground">{research.currentStatus}</div>
            </div>
            <div className="p-4">
              {timelineItems.length > 0 ? (
                <div
                  ref={containerRef}
                  className="max-h-[500px] sm:max-h-[400px] overflow-y-auto pr-2"
                  onScroll={handleScroll}
                >
                  <div ref={contentRef}>
                    <ResearchTimeline
                      items={timelineItems}
                      live
                      expandedItems={expandedItems}
                      onToggleItem={toggleItem}
                      registerList={registerList}
                    />
                  </div>
                  <div ref={bottomRef} />
                </div>
              ) : research.plan ? (
                <PlanOutline plan={research.plan} />
              ) : (
                <PlanSkeleton />
              )}
            </div>
          </div>
        )}
        {resultPanels}
      </div>
      {sourcesSheet}
    </>
  );
}

export const ExtremeSearch = memo(ExtremeSearchComponent);
