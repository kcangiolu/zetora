'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, Code2, Globe, Lightbulb, Search } from 'lucide-react';
import { XLogoIcon } from '@phosphor-icons/react/dist/ssr';

import { TextShimmer } from '@/components/core/text-shimmer';
import { Spinner } from '@/components/ui/spinner';
import { getDisplayHostname, getHostFaviconUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

import { isTimelineItemRunning, type TimelineItem } from './research-data';
import {
  ChartWithFullView,
  type BrowsePageExecution,
  type CodeExecution,
  type FileQueryExecution,
  type SearchQuery,
  type XSearchExecution,
} from './shared';

// The timeline rail: a dot per step, joined by a line.
const RAIL_X = { left: '-0.6rem', transform: 'translateX(-50%)' } as const;
const RUNNING_DOT = 'bg-primary/80 animate-[pulse_0.8s_ease-in-out_infinite]!';

function dotColor(isRunning: boolean, hasResults: boolean): string {
  if (isRunning) return RUNNING_DOT;
  return hasResults ? 'bg-primary' : 'bg-muted-foreground/50';
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function FileIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function StepTitle({ text, shimmer }: { text: string; shimmer: boolean }) {
  return (
    <span className="text-foreground text-[11px] min-w-0 flex-1 wrap-break-word leading-snug">
      {shimmer ? (
        <TextShimmer className="w-full" duration={1.5}>
          {text}
        </TextShimmer>
      ) : (
        text
      )}
    </span>
  );
}

function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[8.5px] text-muted-foreground px-1 py-0.25 rounded-full bg-muted border border-border/50 shrink-0">
      {children}
    </span>
  );
}

function StepNote({ children, shimmer }: { children: React.ReactNode; shimmer?: boolean }) {
  if (shimmer) {
    return (
      <TextShimmer className="text-xs py-0.5" duration={2.5}>
        {String(children)}
      </TextShimmer>
    );
  }
  return <p className="text-[11px] text-muted-foreground py-0.5 mt-0.5">{children}</p>;
}

function QueryChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-2 py-0.5 text-[10px] text-foreground">
      {icon}
      <span className="truncate max-w-[180px]">{children}</span>
    </span>
  );
}

function LinkRow({
  href,
  favicon,
  title,
  hostname,
}: {
  href: string;
  favicon: string;
  title: string;
  hostname: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      className="flex items-center gap-2.5 px-2 py-1.5 text-[12px] hover:bg-accent/50 rounded-sm transition-colors"
    >
      <img
        src={favicon}
        alt=""
        className="h-4 w-4 rounded shrink-0"
        onError={(e) => {
          e.currentTarget.src = getHostFaviconUrl('example.com');
          e.currentTarget.style.filter = 'grayscale(100%)';
        }}
      />
      <div className="flex-1 min-w-0 text-foreground truncate">{title}</div>
      <div className="text-[11px] text-muted-foreground shrink-0">{hostname}</div>
    </a>
  );
}

interface StepFrameProps {
  index: number;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  dotClassName: string;
  dotTitle?: string;
  header: React.ReactNode;
  children: React.ReactNode;
}

function StepFrame({ index, isLast, expanded, onToggle, dotClassName, dotTitle, header, children }: StepFrameProps) {
  return (
    <motion.div
      className="space-y-0 relative"
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1, delay: index * 0.01 }}
    >
      <div
        className="absolute rounded-full bg-background z-5"
        style={{ ...RAIL_X, top: '4px', width: '10px', height: '10px' }}
      />
      <div
        className={`absolute rounded-full ${dotClassName} transition-colors duration-300 z-10`}
        style={{ ...RAIL_X, top: '5px', width: '8px', height: '8px' }}
        title={dotTitle}
      />
      {index > 0 && (
        <div className="absolute bg-secondary" style={{ ...RAIL_X, top: '0', width: '2px', height: '5px' }} />
      )}
      <div
        className="absolute bg-secondary"
        style={{
          ...RAIL_X,
          top: '13px',
          width: '2px',
          height: expanded ? 'calc(100% - 13px)' : isLast ? '0' : 'calc(100% - 9px)',
        }}
      />

      <div
        className="flex items-start gap-1.5 cursor-pointer py-1 px-1.5 hover:bg-accent/50 rounded-md transition-colors duration-150 relative"
        onClick={onToggle}
      >
        {header}
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.2, ease: 'easeOut' }, opacity: { duration: 0.15 } }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// What each step needs from the timeline besides its own data.
interface StepProps {
  frame: Omit<StepFrameProps, 'dotClassName' | 'dotTitle' | 'header' | 'children'>;
  // Whether the research is still running, which is when progress notes and shimmer show.
  live: boolean;
  // The plain-language next step the agent announced right before this one.
  announcedTitle?: string;
  registerList: (id: string) => (node: HTMLElement | null) => void;
}

function ListPanel({
  listRef,
  className,
  children,
}: {
  listRef?: (node: HTMLElement | null) => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={cn('rounded-lg bg-card! border border-border/50! p-2 overflow-y-auto mt-1.5', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      ref={listRef}
    >
      {children}
    </motion.div>
  );
}

function WebSearchStep({
  group,
  frame,
  live,
  announcedTitle,
  registerList,
}: StepProps & { group: { id: string; queries: SearchQuery[] } }) {
  const activeQuery = group.queries.find((q) => q.status === 'reading_content' || q.status === 'started');
  const isRunning = Boolean(activeQuery);
  const isReadingContent = group.queries.some((q) => q.status === 'reading_content');
  const sources = Array.from(
    new Map(group.queries.flatMap((q) => q.sources).map((source) => [source.url, source])).values(),
  );
  const title = announcedTitle || (activeQuery || group.queries[0])?.query || 'Searching';

  return (
    <StepFrame
      {...frame}
      dotClassName={dotColor(
        isRunning,
        group.queries.some((q) => q.sources.length > 0),
      )}
      dotTitle={`Status: ${activeQuery?.status || 'completed'}`}
      header={
        <>
          <Search className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <StepTitle text={title} shimmer={isRunning && live} />
          {group.queries.length > 1 && <CountBadge>{group.queries.length} queries</CountBadge>}
        </>
      }
    >
      <div className="pl-0.5 py-0.5 space-y-1">
        <div className="flex flex-wrap gap-1">
          {group.queries.map((query, index) => (
            <QueryChip key={`${query.id}-${index}`} icon={<Search className="h-2.5 w-2.5 text-muted-foreground" />}>
              {query.query}
            </QueryChip>
          ))}
        </div>

        {sources.length > 0 && (
          <ListPanel listRef={registerList(group.id)} className="max-h-[180px]">
            {sources.map((source, index) => {
              const hostname = getDisplayHostname(source.url) || source.url;
              return (
                <LinkRow
                  key={index}
                  href={source.url}
                  favicon={source.favicon || getHostFaviconUrl(hostname)}
                  title={source.title || hostname}
                  hostname={hostname}
                />
              );
            })}
          </ListPanel>
        )}

        {isReadingContent && sources.length > 0 && live ? (
          <StepNote shimmer>Reading content...</StepNote>
        ) : isRunning && live ? (
          <StepNote shimmer>Searching sources...</StepNote>
        ) : (
          sources.length === 0 && !isRunning && <StepNote>No sources found for this search.</StepNote>
        )}
      </div>
    </StepFrame>
  );
}

function XSearchStep({
  group,
  frame,
  live,
  announcedTitle,
  registerList,
}: StepProps & { group: { id: string; searches: XSearchExecution[] } }) {
  const activeSearch = group.searches.find((search) => search.status === 'started');
  const isRunning = Boolean(activeSearch);
  const first = group.searches[0];
  const handles = first?.handles || [];
  const citations = Array.from(
    new Map(
      group.searches
        .flatMap((search) => search.result?.citations || [])
        .map((citation: any, index) => {
          const url = typeof citation === 'string' ? citation : citation.url;
          return [url || `citation-${index}`, citation];
        }),
    ).values(),
  );
  const title = announcedTitle || `X search: ${(activeSearch || first)?.query || 'Searching'}`;

  return (
    <StepFrame
      {...frame}
      dotClassName={dotColor(isRunning, citations.length > 0)}
      dotTitle={`Status: ${activeSearch?.status || 'completed'}`}
      header={
        <>
          <div className="p-0.5 rounded bg-foreground shrink-0 mt-0.5">
            <XLogoIcon className="size-2.5 text-background" />
          </div>
          <StepTitle text={title} shimmer={isRunning && live} />
          {group.searches.length > 1 && <CountBadge>{group.searches.length} queries</CountBadge>}
          {handles.length > 0 && <CountBadge>{handles.length} handles</CountBadge>}
        </>
      }
    >
      <div className="pl-0.5 py-0.5 space-y-1">
        <div className="text-[10px] text-muted-foreground mb-0.5">
          {(activeSearch || first)?.startDate} to {(activeSearch || first)?.endDate}
        </div>
        <div className="flex flex-wrap gap-1">
          {group.searches.map((search, index) => (
            <QueryChip
              key={`${search.id}-${index}`}
              icon={
                <div className="p-0.5 rounded bg-foreground">
                  <XLogoIcon className="size-2 text-background" />
                </div>
              }
            >
              {search.query}
            </QueryChip>
          ))}
        </div>

        {citations.length > 0 && (
          <ListPanel listRef={registerList(group.id)} className="max-h-[160px]">
            {citations.map((citation: any, index: number) => {
              const url = typeof citation === 'string' ? citation : citation.url;
              const hostname = getDisplayHostname(url) || url || '';
              return (
                <LinkRow
                  key={index}
                  href={url}
                  favicon={getHostFaviconUrl(hostname || 'example.com')}
                  title={(typeof citation === 'object' && citation.title) || 'X post'}
                  hostname={hostname}
                />
              );
            })}
          </ListPanel>
        )}

        {isRunning && live && <StepNote shimmer>Searching X posts...</StepNote>}
        {!isRunning && citations.length === 0 && <StepNote>No X posts found for this search.</StepNote>}
      </div>
    </StepFrame>
  );
}

function FileQueryStep({
  group,
  frame,
  live,
  announcedTitle,
  registerList,
}: StepProps & { group: { id: string; queries: FileQueryExecution[] } }) {
  const activeQuery = group.queries.find((q) => q.status === 'started');
  const isRunning = Boolean(activeQuery);
  const results = Array.from(
    new Map(
      group.queries
        .flatMap((q) => q.results || [])
        .map((result) => [`${result.fileName}-${result.content.slice(0, 50)}`, result]),
    ).values(),
  );
  const title = announcedTitle || (activeQuery || group.queries[0])?.query || 'Searching files';

  return (
    <StepFrame
      {...frame}
      dotClassName={dotColor(isRunning, results.length > 0)}
      dotTitle={`Status: ${activeQuery?.status || 'completed'}`}
      header={
        <>
          <FileIcon className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <StepTitle text={title} shimmer={isRunning && live} />
          {group.queries.length > 1 && <CountBadge>{group.queries.length} queries</CountBadge>}
        </>
      }
    >
      <div className="pl-0.5 py-0.5 space-y-1">
        <div className="flex flex-wrap gap-1">
          {group.queries.map((query, index) => (
            <QueryChip key={`${query.id}-${index}`} icon={<FileIcon className="h-2.5 w-2.5 text-muted-foreground" />}>
              {query.query}
            </QueryChip>
          ))}
        </div>

        {results.length > 0 && (
          <ListPanel listRef={registerList(group.id)} className="max-h-[180px]">
            {results.map((result, index) => (
              <div key={index} className="flex items-start gap-2.5 px-2 py-1.5 text-[11px] rounded transition-colors">
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground font-medium truncate">{result.fileName}</div>
                  <div className="text-muted-foreground line-clamp-2 mt-0.5">{result.content.slice(0, 150)}...</div>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">{Math.round(result.score * 100)}%</div>
              </div>
            ))}
          </ListPanel>
        )}

        {isRunning && live && <StepNote shimmer>Searching files...</StepNote>}
        {!isRunning && results.length === 0 && <StepNote>No results found in files.</StepNote>}
      </div>
    </StepFrame>
  );
}

function BrowsePageStep({
  executions,
  frame,
  live,
  announcedTitle,
}: StepProps & { executions: BrowsePageExecution[] }) {
  const isRunning = executions.some((bp) => bp.status === 'started' || bp.status === 'browsing');
  const results = executions.flatMap((bp) => bp.results || []);
  const urls = executions.flatMap((bp) => bp.urls);
  const title = announcedTitle || `Browsing ${urls.length} page${urls.length !== 1 ? 's' : ''}`;

  return (
    <StepFrame
      {...frame}
      dotClassName={dotColor(isRunning, results.length > 0)}
      dotTitle={`Status: ${executions[0].status}`}
      header={
        <>
          <Globe className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <StepTitle text={title} shimmer={isRunning && live} />
          {urls.length > 1 && <CountBadge>{urls.length} pages</CountBadge>}
        </>
      }
    >
      <div className="pl-0.5 py-0.5 space-y-1">
        <div className="flex flex-wrap gap-1">
          {urls.map((url, index) => {
            const hostname = hostnameOf(url);
            return (
              <QueryChip
                key={`${url}-${index}`}
                icon={
                  <img
                    src={getHostFaviconUrl(hostname, 16)}
                    alt=""
                    className="h-2.5 w-2.5 rounded-sm object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                }
              >
                {hostname}
              </QueryChip>
            );
          })}
        </div>

        {results.length > 0 && (
          <ListPanel className="max-h-[200px] space-y-2">
            {results.map((result, index) => {
              const hostname = hostnameOf(result.url);
              return (
                <div key={index} className="flex items-start gap-2 text-[11px]">
                  <img
                    src={result.favicon || getHostFaviconUrl(hostname, 16)}
                    alt=""
                    className="h-3.5 w-3.5 rounded-sm object-contain shrink-0 mt-0.5"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-medium text-foreground truncate">{result.title || hostname}</span>
                      {result.error && <span className="text-[9px] text-destructive shrink-0">(error)</span>}
                    </div>
                    {result.content && !result.error && (
                      <p className="text-muted-foreground line-clamp-2 mt-0.5">{result.content.slice(0, 200)}</p>
                    )}
                    {result.error && (
                      <p className="text-muted-foreground line-clamp-1 mt-0.5 text-[10px]">{result.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </ListPanel>
        )}

        {isRunning && live && <StepNote shimmer>Browsing pages...</StepNote>}
        {!isRunning && results.length === 0 && <StepNote>No content retrieved.</StepNote>}
      </div>
    </StepFrame>
  );
}

function CodeStep({ code, frame, live, registerList }: StepProps & { code: CodeExecution }) {
  const isRunning = code.status === 'running';
  return (
    <StepFrame
      {...frame}
      dotClassName={isRunning ? RUNNING_DOT : 'bg-primary'}
      dotTitle={`Status: ${code.status}`}
      header={
        <>
          <Code2 className="w-3 h-3 text-primary shrink-0 mt-0.5" />
          <StepTitle text={code.title} shimmer={isRunning && live} />
        </>
      }
    >
      <div className="pl-0.5 py-0.5">
        <div
          className="bg-muted/50 border border-border p-2 rounded-lg my-1.5 overflow-auto max-h-[120px] text-[11px] font-mono"
          ref={registerList(`${code.id}-code`)}
        >
          <pre className="whitespace-pre-wrap wrap-break-word text-foreground">{code.code}</pre>
        </div>
        {code.result && (
          <div className="mt-3">
            <div className="text-[11px] text-muted-foreground font-medium mb-1">Result:</div>
            <div
              className="bg-muted/50 border border-border p-2 rounded-lg overflow-auto max-h-[90px] text-[11px] font-mono"
              ref={registerList(`${code.id}-result`)}
            >
              <pre className="whitespace-pre-wrap wrap-break-word text-foreground">{code.result}</pre>
            </div>
          </div>
        )}
        {code.charts && code.charts.length > 0 && (
          <div className="mt-3 mb-1 space-y-4">
            {code.charts.map((chart: any, chartIndex: number) => (
              <div key={chartIndex} className="w-full">
                <ChartWithFullView chart={chart} index={chartIndex} />
              </div>
            ))}
          </div>
        )}
        {isRunning && live && (
          <TextShimmer className="text-xs py-0.5 mt-1" duration={2.5}>
            Executing code...
          </TextShimmer>
        )}
      </div>
    </StepFrame>
  );
}

function TextStep({
  frame,
  icon,
  title,
  text,
  dotTitle,
}: {
  frame: StepProps['frame'];
  icon: React.ReactNode;
  title: string;
  text: React.ReactNode;
  dotTitle?: string;
}) {
  return (
    <StepFrame
      {...frame}
      dotClassName="bg-primary"
      dotTitle={dotTitle}
      header={
        <>
          {icon}
          <StepTitle text={title} shimmer={false} />
        </>
      }
    >
      <div className="pl-0.5 py-0.5">{text}</div>
    </StepFrame>
  );
}

// Shown between steps while the agent decides what to do next.
function WaitingForAgent() {
  return (
    <motion.div
      key="waiting"
      className="relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div
        className="absolute rounded-full bg-background z-5"
        style={{ ...RAIL_X, top: '4px', width: '10px', height: '10px' }}
      />
      <div
        className="absolute rounded-full bg-primary/60 animate-pulse z-10"
        style={{ ...RAIL_X, top: '5px', width: '8px', height: '8px' }}
      />
      <div className="absolute bg-secondary" style={{ ...RAIL_X, top: '-12px', width: '2px', height: '17px' }} />
      <div className="flex items-start gap-1.5 py-1 px-1.5">
        <Spinner className="size-3.5 shrink-0" />
        <span className="text-[11px] text-muted-foreground/60 leading-snug">Waiting for agent...</span>
      </div>
    </motion.div>
  );
}

const noListRegistration = () => () => {};

export function ResearchTimeline({
  items,
  live,
  expandedItems,
  onToggleItem,
  registerList = noListRegistration,
}: {
  items: TimelineItem[];
  live: boolean;
  expandedItems: Record<string, boolean>;
  onToggleItem: (id: string) => void;
  registerList?: (id: string) => (node: HTMLElement | null) => void;
}) {
  const last = items.at(-1);
  const isWaitingForAgent =
    live &&
    last !== undefined &&
    last.kind !== 'done' &&
    last.kind !== 'thinking' &&
    !isTimelineItemRunning(last, true);

  return (
    <div className="space-y-0 relative ml-4 mb-1">
      <AnimatePresence>
        {items.map((timelineItem, index) => {
          const { id } = timelineItem.item;
          const previous = items[index - 1];
          const step: StepProps = {
            frame: {
              index,
              isLast: index === items.length - 1,
              expanded: Boolean(expandedItems[id]),
              onToggle: () => onToggleItem(id),
            },
            live,
            announcedTitle: previous?.kind === 'thinking' ? previous.item.nextStep : undefined,
            registerList,
          };

          switch (timelineItem.kind) {
            case 'query_group':
              return <WebSearchStep key={id} {...step} group={timelineItem.item} />;
            case 'x_search_group':
              return <XSearchStep key={id} {...step} group={timelineItem.item} />;
            case 'file_query_group':
              return <FileQueryStep key={id} {...step} group={timelineItem.item} />;
            case 'browse_page_group':
              return <BrowsePageStep key={id} {...step} executions={timelineItem.item.executions} />;
            case 'code':
              return <CodeStep key={id} {...step} code={timelineItem.item} />;
            case 'thinking':
              return (
                <TextStep
                  key={id}
                  frame={step.frame}
                  icon={<Lightbulb className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
                  title="Thinking"
                  text={
                    timelineItem.item.thought?.trim() ? (
                      <p className="text-[11px] text-muted-foreground leading-snug">{timelineItem.item.thought}</p>
                    ) : (
                      <StepNote>No thought captured.</StepNote>
                    )
                  }
                />
              );
            case 'done':
              return (
                <TextStep
                  key={id}
                  frame={step.frame}
                  dotTitle="Research completed"
                  icon={
                    <svg
                      className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  }
                  title="Done"
                  text={<p className="text-[11px] text-muted-foreground leading-snug">{timelineItem.item.summary}</p>}
                />
              );
          }
        })}
      </AnimatePresence>

      {isWaitingForAgent && <WaitingForAgent />}
    </div>
  );
}
