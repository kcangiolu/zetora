import type { DataExtremeSearchPart } from '@/lib/types';
import { getFaviconUrl } from '@/lib/url';

import type {
  BrowsePageExecution,
  CodeExecution,
  DoneExecution,
  ExtremeSearchSource,
  FileQueryExecution,
  SearchQuery,
  ThinkingExecution,
  XSearchExecution,
} from './shared';

type ResearchEvent = DataExtremeSearchPart['data'];
type PlanEvent = Extract<ResearchEvent, { kind: 'plan' }>;

export type ResearchPlan = NonNullable<PlanEvent['plan']>;

export type TimelineItem =
  | { kind: 'query_group'; item: { id: string; queries: SearchQuery[] } }
  | { kind: 'x_search_group'; item: { id: string; searches: XSearchExecution[] } }
  | { kind: 'file_query_group'; item: { id: string; queries: FileQueryExecution[] } }
  | { kind: 'browse_page_group'; item: { id: string; executions: BrowsePageExecution[] } }
  | { kind: 'code'; item: CodeExecution }
  | { kind: 'thinking'; item: ThinkingExecution }
  | { kind: 'done'; item: DoneExecution };

export interface ResearchView {
  isCompleted: boolean;
  currentStatus: string;
  // The plan, shown until the first step arrives.
  plan: ResearchPlan | null;
  timelineItems: TimelineItem[];
  sources: ExtremeSearchSource[];
  charts: NonNullable<CodeExecution['charts']>;
  xSearches: XSearchExecution[];
  fileQueries: FileQueryExecution[];
}

// A tool call streams one event per query, with ids `${toolCallId}-${index}`;
// the queries of one call form one timeline group.
function groupIdOf(id: string): string {
  return id.includes('-') ? id.split('-').slice(0, -1).join('-') : id;
}

function lastOfKind<K extends ResearchEvent['kind']>(
  events: ResearchEvent[],
  kind: K,
): Extract<ResearchEvent, { kind: K }> | undefined {
  return events.findLast((event): event is Extract<ResearchEvent, { kind: K }> => event.kind === kind);
}

function describeStatus(events: ResearchEvent[], plan: ResearchPlan | null): string {
  if (events.length === 0) return 'Initializing...';
  if (events.some((event) => event.kind === 'done')) return 'Wrapping up research...';
  if (!plan) return 'Planning research...';

  const hasSearches = events.some((event) => ['query', 'x_search', 'file_query', 'browse_page'].includes(event.kind));
  const hasThinking = events.some((event) => event.kind === 'thinking');
  if (!hasSearches && !hasThinking) return 'Planning completed, starting up research agent...';

  const latestQuery = lastOfKind(events, 'query');
  const latestXSearch = lastOfKind(events, 'x_search');
  const latestFileQuery = lastOfKind(events, 'file_query');
  const latestBrowsePage = lastOfKind(events, 'browse_page');
  const latestCode = lastOfKind(events, 'code');
  const latestNextStep = lastOfKind(events, 'thinking')?.nextStep;

  if (events.at(-1)?.kind === 'thinking') return 'Thinking...';
  if (latestCode?.status === 'running') return 'Running analysis...';
  if (latestFileQuery?.status === 'started') return latestNextStep || 'Searching files...';
  if (latestBrowsePage?.status === 'started' || latestBrowsePage?.status === 'browsing') {
    return latestNextStep || 'Browsing pages...';
  }
  if (latestQuery?.status === 'started' || latestXSearch?.status === 'started') return latestNextStep || 'Searching...';
  if (latestQuery?.status === 'reading_content') return 'Reading sources...';
  if (hasSearches) return 'Analyzing results...';
  return 'Researching...';
}

function collectSearchQueries(events: ResearchEvent[]): Map<string, SearchQuery> {
  const queries = new Map<string, SearchQuery>();
  for (const event of events) {
    if (event.kind === 'query') {
      const existing = queries.get(event.queryId);
      if (existing) {
        existing.status = event.status;
        existing.index = event.index;
        existing.total = event.total;
      } else {
        queries.set(event.queryId, {
          id: event.queryId,
          query: event.query,
          index: event.index,
          total: event.total,
          status: event.status,
          sources: [],
          content: [],
        });
      }
    } else if (event.kind === 'source') {
      const query = queries.get(event.queryId);
      if (query && !query.sources.some((s) => s.url === event.source.url)) {
        query.sources.push({
          title: event.source.title || '',
          url: event.source.url,
          content: '',
          favicon: event.source.favicon || getFaviconUrl(event.source.url),
        });
      }
    } else if (event.kind === 'content') {
      const query = queries.get(event.queryId);
      if (query && !query.content.some((c) => c.url === event.content.url)) {
        query.content.push({
          title: event.content.title || '',
          url: event.content.url,
          text: event.content.text || '',
          favicon: event.content.favicon || getFaviconUrl(event.content.url),
        });
      }
    }
  }

  // A source shows the page text read for it, once it arrives.
  for (const query of queries.values()) {
    for (const source of query.sources) {
      const text = query.content.find((c) => c.url === source.url)?.text;
      if (text) source.content = text;
    }
  }
  return queries;
}

export function deriveResearchView(annotations: DataExtremeSearchPart[]): ResearchView {
  const events = annotations.filter((a) => a.type === 'data-extreme_search').map((a) => a.data);

  const latestPlan = lastOfKind(events, 'plan');
  const isCompleted =
    events.some((event) => event.kind === 'done') || latestPlan?.status?.title === 'Research completed';
  const plan = latestPlan?.plan ?? null;

  const searchQueries = collectSearchQueries(events);
  const xSearches = new Map<string, XSearchExecution>();
  const fileQueries = new Map<string, FileQueryExecution>();
  const browsePages = new Map<string, BrowsePageExecution>();
  const codeRuns = new Map<string, CodeExecution>();
  const thoughts = new Map<string, ThinkingExecution>();
  for (const event of events) {
    if (event.kind === 'x_search') {
      xSearches.set(event.xSearchId, {
        id: event.xSearchId,
        query: event.query,
        index: event.index,
        total: event.total,
        startDate: event.startDate,
        endDate: event.endDate,
        handles: event.handles,
        status: event.status,
        result: event.result,
      });
    } else if (event.kind === 'file_query') {
      fileQueries.set(event.fileQueryId, {
        id: event.fileQueryId,
        query: event.query,
        index: event.index,
        total: event.total,
        status: event.status,
        results: event.results,
      });
    } else if (event.kind === 'browse_page') {
      browsePages.set(event.browseId, {
        id: event.browseId,
        urls: event.urls,
        index: event.index,
        total: event.total,
        status: event.status,
        results: event.results ?? browsePages.get(event.browseId)?.results,
      });
    } else if (event.kind === 'code') {
      codeRuns.set(event.codeId, {
        id: event.codeId,
        title: event.title,
        code: event.code,
        status: event.status,
        result: event.result,
        charts: event.charts,
      });
    } else if (event.kind === 'thinking') {
      thoughts.set(event.thinkingId, { id: event.thinkingId, thought: event.thought, nextStep: event.nextStep });
    }
  }

  // Timeline order is the order in which each step first streamed in.
  const timelineItems: TimelineItem[] = [];
  const seen = new Set<string>();
  const addOnce = (key: string, item: TimelineItem) => {
    if (seen.has(key)) return;
    seen.add(key);
    timelineItems.push(item);
  };
  const inGroup = <T extends { id: string }>(executions: Map<string, T>, groupId: string) =>
    Array.from(executions.values()).filter((execution) => groupIdOf(execution.id) === groupId);

  for (const event of events) {
    if (event.kind === 'query') {
      const id = groupIdOf(event.queryId);
      addOnce(`q:${id}`, { kind: 'query_group', item: { id, queries: inGroup(searchQueries, id) } });
    } else if (event.kind === 'x_search') {
      const id = groupIdOf(event.xSearchId);
      addOnce(`x:${id}`, { kind: 'x_search_group', item: { id, searches: inGroup(xSearches, id) } });
    } else if (event.kind === 'file_query') {
      const id = groupIdOf(event.fileQueryId);
      addOnce(`fq:${id}`, { kind: 'file_query_group', item: { id, queries: inGroup(fileQueries, id) } });
    } else if (event.kind === 'browse_page') {
      const execution = browsePages.get(event.browseId)!;
      addOnce(`bp:${event.browseId}`, {
        kind: 'browse_page_group',
        item: { id: event.browseId, executions: [execution] },
      });
    } else if (event.kind === 'code') {
      addOnce(`c:${event.codeId}`, { kind: 'code', item: codeRuns.get(event.codeId)! });
    } else if (event.kind === 'thinking') {
      addOnce(`t:${event.thinkingId}`, { kind: 'thinking', item: thoughts.get(event.thinkingId)! });
    } else if (event.kind === 'done') {
      addOnce('d', { kind: 'done', item: { id: 'done-0', summary: event.summary } });
    }
  }

  const allSources = Array.from(searchQueries.values()).flatMap((query) => query.sources);
  return {
    isCompleted,
    currentStatus: isCompleted ? 'Research completed' : describeStatus(events, plan),
    plan: isCompleted ? null : plan,
    timelineItems,
    sources: Array.from(new Map(allSources.map((source) => [source.url, source])).values()),
    charts: Array.from(codeRuns.values()).flatMap((run) => run.charts || []),
    xSearches: Array.from(xSearches.values()),
    fileQueries: Array.from(fileQueries.values()),
  };
}

// A step still waiting on a tool. Thinking counts as running while it is the newest step.
export function isTimelineItemRunning(timelineItem: TimelineItem, isLast: boolean): boolean {
  switch (timelineItem.kind) {
    case 'query_group':
      return timelineItem.item.queries.some((q) => q.status === 'started' || q.status === 'reading_content');
    case 'x_search_group':
      return timelineItem.item.searches.some((s) => s.status === 'started');
    case 'file_query_group':
      return timelineItem.item.queries.some((q) => q.status === 'started');
    case 'browse_page_group':
      return timelineItem.item.executions.some((bp) => bp.status === 'started' || bp.status === 'browsing');
    case 'code':
      return timelineItem.item.status === 'running';
    case 'thinking':
      return isLast;
    case 'done':
      return false;
  }
}

// The X posts found so far, merged across searches, for the X tab.
export function combineXSearches(executions: XSearchExecution[]) {
  const completed = executions.filter((x) => x.status === 'completed' && x.result);
  if (completed.length === 0) return null;
  return {
    citations: completed.flatMap((x) => x.result!.citations || []),
    dateRange: `${completed[0].startDate || ''} to ${completed[completed.length - 1].endDate || ''}`,
    queries: completed.map((x) => x.query).filter((query) => query.length > 0),
  };
}

// The file passages found so far, without duplicates, for the Files tab.
export function combineFileQueries(executions: FileQueryExecution[]) {
  const completed = executions.filter((fq) => fq.status === 'completed' && fq.results && fq.results.length > 0);
  if (completed.length === 0) return null;
  const results = Array.from(
    new Map(
      completed
        .flatMap((fq) => fq.results || [])
        .map((result) => [`${result.fileName}-${result.content.slice(0, 50)}`, result]),
    ).values(),
  );
  return { results, queries: completed.map((fq) => fq.query).filter(Boolean) };
}
