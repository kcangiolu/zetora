'use client';

import React from 'react';
import { FlaskConical, Search } from 'lucide-react';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { XLogoIcon } from '@phosphor-icons/react/dist/ssr';

import type { combineFileQueries, combineXSearches } from './research-data';
import { ChartWithFullView, ExtremeSourceCard, Icons, Tweet, type ExtremeSearchSource } from './shared';

type XPosts = NonNullable<ReturnType<typeof combineXSearches>>;
type FilePassages = NonNullable<ReturnType<typeof combineFileQueries>>;

export type ResearchTab = 'process' | 'visualizations' | 'xsearch' | 'files' | 'sources';

function FileIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function TabLabel({
  icon,
  label,
  shortLabel,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  shortLabel?: string;
  count?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 leading-none">
      {icon}
      {shortLabel ? (
        <>
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
      {count !== undefined && <span className="text-[10px] opacity-60 translate-y-px tabular-nums">{count}</span>}
    </span>
  );
}

// Each tab shows only when it has something in it; the process tab always shows.
export function ResearchTabs({
  activeTab,
  onTabChange,
  stepCount,
  chartCount,
  xPosts,
  filePassages,
  sourceCount,
}: {
  activeTab: ResearchTab;
  onTabChange: (tab: ResearchTab) => void;
  stepCount: number;
  chartCount: number;
  xPosts: XPosts | null;
  filePassages: FilePassages | null;
  sourceCount: number;
}) {
  const tabs = [
    {
      value: 'process',
      label: (
        <TabLabel
          icon={<FlaskConical className="h-3 w-3 shrink-0" />}
          label="Research Process"
          shortLabel="Process"
          count={stepCount > 0 ? stepCount : undefined}
        />
      ),
    },
    chartCount > 0 && {
      value: 'visualizations',
      label: (
        <TabLabel
          icon={
            <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          }
          label="Visualizations"
          count={chartCount}
        />
      ),
    },
    xPosts && {
      value: 'xsearch',
      label: (
        <TabLabel
          icon={<XLogoIcon className="h-3 w-3 shrink-0" />}
          label="X Search"
          shortLabel="X"
          count={xPosts.citations.length}
        />
      ),
    },
    filePassages && {
      value: 'files',
      label: (
        <TabLabel icon={<FileIcon className="h-3 w-3 shrink-0" />} label="Files" count={filePassages.results.length} />
      ),
    },
    sourceCount > 0 && {
      value: 'sources',
      label: <TabLabel icon={<Icons.Globe className="h-3 w-3 shrink-0" />} label="Sources" count={sourceCount} />,
    },
  ].filter((tab) => tab !== false && tab !== null);

  return (
    <div className="px-2.5 py-2 border-b border-border bg-background overflow-x-auto no-scrollbar">
      <KumoTabs
        variant="segmented"
        value={activeTab}
        onValueChange={(value) => onTabChange(value as ResearchTab)}
        className="w-full [--color-kumo-tint:var(--accent)] [--color-kumo-base:var(--background)] [--color-kumo-recessed:var(--muted)] [--color-kumo-surface:var(--card)] [--text-color-kumo-default:var(--foreground)] [--text-color-kumo-strong:var(--muted-foreground)] [--text-color-kumo-subtle:var(--muted-foreground)] [--color-kumo-ring:var(--border)]"
        listClassName="w-full [&>button]:flex-1 [&>button]:justify-center"
        tabs={tabs}
      />
    </div>
  );
}

export function ChartsPanel({ charts }: { charts: any[] }) {
  return (
    <div className="max-h-[450px] overflow-y-auto">
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-[200px]">
        {charts.map((chart, index) => (
          <ChartWithFullView key={index} chart={chart} index={index} />
        ))}
      </div>
    </div>
  );
}

export function XPostsPanel({ posts }: { posts: XPosts }) {
  const tweets = posts.citations.filter((citation) => citation.tweet_id);
  return (
    <div>
      <div className="px-4 py-2.5 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{posts.citations.length} posts</span>
          {posts.dateRange && (
            <>
              <span className="text-border">·</span>
              <span>{posts.dateRange}</span>
            </>
          )}
          {posts.queries.length > 0 && (
            <>
              <span className="text-border">·</span>
              <span>
                {posts.queries.length} {posts.queries.length === 1 ? 'query' : 'queries'}
              </span>
            </>
          )}
        </div>
      </div>

      {tweets.length > 0 && (
        <div className="px-3 pt-3">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
            {tweets.map((citation, index) => (
              <div key={citation.tweet_id || index} className="shrink-0 w-[260px] sm:w-[300px]">
                <div className="tweet-wrapper">
                  <Tweet id={citation.tweet_id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilePassagesPanel({ passages }: { passages: FilePassages }) {
  return (
    <div className="max-h-[400px] overflow-y-auto">
      {passages.queries.length > 0 && (
        <div className="px-5 py-3 border-b border-border sticky top-0 z-10 bg-background">
          <div className="flex flex-wrap gap-1.5">
            {passages.queries.map((query, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground"
              >
                <Search className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="truncate max-w-[200px]">{query}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="divide-y divide-border">
        {passages.results.map((result, index) => (
          <div key={index} className="px-5 py-3 hover:bg-accent/30 transition-colors">
            <div className="flex items-start gap-3">
              <FileIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground truncate">{result.fileName}</span>
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border/50">
                    {Math.round(result.score * 100)}% match
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{result.content}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SourcesPanel({ sources, onShowAll }: { sources: ExtremeSearchSource[]; onShowAll: () => void }) {
  return (
    <div className="bg-background">
      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {sources.map((source, index) => (
          <a key={index} href={source.url} target="_blank" className="block">
            <ExtremeSourceCard source={source} />
          </a>
        ))}
      </div>
      <div className="border-t border-border px-4 py-2">
        <button
          onClick={onShowAll}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-accent/50 transition-colors duration-150"
        >
          View all {sources.length} sources
          <Icons.ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
