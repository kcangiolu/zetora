'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Globe, MapPin, Code, Film, Sparkles, Loader2 } from 'lucide-react';
import { GeneratedImageCard, GeneratedImageCardProps } from '@/components/generated-image-card';
import {
  SearchLoadingState,
  NearbySearchSkeleton,
  CodeInterpreterView,
} from '@/components/tool-invocation-list-view';
import { StockChartLoader } from '@/components/message-parts/shared';
import { StreamingIndicator } from '@/components/streaming-indicator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { TextShimmer } from '@/components/core/text-shimmer';
import { TextLoop } from '@/components/core/text-loop';
import { ZetoraLogo } from '@/components/logos/zetora-logo';
import RedditSearch from '@/components/reddit-search';
import GitHubSearch from '@/components/github-search';
import MultiSearch from '@/components/multi-search';
import { ExtremeSearch } from '@/components/extreme-search/extreme-search';
import { StatusBadge } from '@/app/lookout/components/status-badge';
import { ColorPanels } from '@paper-design/shaders-react';
import type { DataExtremeSearchPart } from '@/lib/types';

type Phase = 'input-streaming' | 'input-available' | 'output-available';

function picsum(seed: string, w: number, h: number) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

function DemoImageCard({
  mode,
  prompt,
  size,
  sourceImageUrl,
  seed,
  w,
  h,
}: {
  mode: GeneratedImageCardProps['mode'];
  prompt: string;
  size?: string;
  sourceImageUrl?: string;
  seed: string;
  w: number;
  h: number;
}) {
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>('input-streaming');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const play = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setImageUrl(undefined);
    setPhase('input-streaming');
    setRun((r) => r + 1);
    timers.current.push(setTimeout(() => setPhase('input-available'), 2000));
    timers.current.push(
      setTimeout(() => {
        setImageUrl(picsum(seed, w, h));
        setPhase('output-available');
      }, 2000 + 4000),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {mode} — {size ?? 'edit'}
        </p>
        <Button size="sm" variant="outline" onClick={play}>
          Play
        </Button>
      </div>
      <GeneratedImageCard
        key={run}
        mode={mode}
        state={phase}
        prompt={prompt}
        size={size}
        sourceImageUrl={sourceImageUrl}
        imageUrl={imageUrl}
      />
    </div>
  );
}

// Kept in sync with real call sites in message-parts/index.tsx so this preview never
// drifts from production copy — avoid reusing labels that belong to a different
// component (e.g. GeneratedImageCard's "Generating image…" / "Editing image…").
const LOADER_COLORS = [
  { color: 'red' as const, icon: Search, text: 'Searching the web...' },
  { color: 'green' as const, icon: Globe, text: 'Fetching page...' },
  { color: 'orange' as const, icon: MapPin, text: 'Finding places...' },
  { color: 'violet' as const, icon: Film, text: 'Discovering entertainment content...' },
  { color: 'gray' as const, icon: Code, text: 'Running code...' },
  { color: 'blue' as const, icon: Sparkles, text: 'Loading skill...' },
];

// Progress events the research tool streams, enough to drive the real timeline UI.
const EXTREME_SEARCH_ANNOTATIONS: DataExtremeSearchPart[] = [
  {
    type: 'data-extreme_search',
    data: {
      kind: 'plan',
      status: { title: 'Planning the research' },
      plan: [
        { title: 'Understand the request', todos: ['Parse the prompt', 'Identify sub-questions'] },
        { title: 'Gather sources', todos: ['Run web searches', 'Cross-check facts'] },
      ],
    },
  },
  {
    type: 'data-extreme_search',
    data: {
      kind: 'query',
      queryId: 'q1',
      query: 'latest open-source LLM benchmarks',
      index: 0,
      total: 2,
      status: 'completed',
    },
  },
  {
    type: 'data-extreme_search',
    data: {
      kind: 'query',
      queryId: 'q2',
      query: 'AI agent framework comparisons 2026',
      index: 1,
      total: 2,
      status: 'started',
    },
  },
  {
    type: 'data-extreme_search',
    data: {
      kind: 'thinking',
      thinkingId: 't1',
      thought: 'Comparing benchmark methodologies across providers before summarizing...',
    },
  },
];

export function LoadingPreviewClient() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-12">
      <div>
        <h1 className="text-xl font-semibold">Loading states preview</h1>
        <p className="text-sm text-muted-foreground">Dev-only playground. Cycle themes + reduced-motion to check all variants.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Generated image card</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <DemoImageCard mode="generate" prompt="A cabin in a snowy forest at dusk, warm light in the windows" size="1024x1024" seed="a" w={1024} h={1024} />
          <DemoImageCard mode="generate" prompt="Wide cinematic shot of a desert highway at sunset" size="1792x1024" seed="b" w={1792} h={1024} />
          <DemoImageCard
            mode="edit"
            prompt="Make the sky purple and add stars"
            sourceImageUrl={picsum('c', 800, 800)}
            seed="c-edit"
            w={800}
            h={800}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">generate — error</p>
            <GeneratedImageCard mode="generate" state="output-error" error="Image generation failed (500): provider timeout" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Search loading state</h2>
        <div className="space-y-2">
          {LOADER_COLORS.map(({ color, icon, text }) => (
            <SearchLoadingState key={color} icon={icon} text={text} color={color} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Source search accordions
        </h2>
        <p className="text-xs text-muted-foreground">
          Each search tool (reddit-search.tsx, github-search.tsx, academic-papers.tsx, file-query-search.tsx,
          x-search.tsx) defines its own near-identical collapsible accordion — two visual variants below,
          plus multi-search.tsx&apos;s image-strip skeleton.
        </p>
        <div className="space-y-3">
          <RedditSearch result={null} args={{ queries: ['best budget mechanical keyboards', 'r/programming hot takes on AI'] }} />
          <GitHubSearch result={null} args={{ queries: ['react state management 2026', 'rust cli tools'] }} />
          <MultiSearch
            result={null}
            args={{ queries: ['latest SpaceX launch', 'GPT-5 benchmarks', 'best hiking trails Colorado'] }}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Extreme search (research timeline + plan)
        </h2>
        <ExtremeSearch annotations={EXTREME_SEARCH_ANNOTATIONS} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Nearby search skeleton</h2>
        <NearbySearchSkeleton type="restaurants" />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Map loading (map-components.tsx)</h2>
        <p className="text-xs text-muted-foreground">
          Plain embedded map (not the nearby-search view above): raw ring-spinner overlay while the map tiles
          load, and a static skeleton for the dynamic-import fallback.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative w-full h-48 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900">
            <div className="absolute inset-0 bg-white/80 dark:bg-neutral-900/80 flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-r-transparent" />
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Loading map...</p>
              </div>
            </div>
          </div>
          <div className="w-full h-48 bg-neutral-100 dark:bg-neutral-800 overflow-hidden relative animate-pulse rounded-lg">
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-200 dark:from-neutral-700 to-transparent opacity-50" />
            <div className="absolute top-3 right-3 space-y-2">
              <div className="w-8 h-8 bg-neutral-300 dark:bg-neutral-700 rounded shadow-sm" />
              <div className="w-8 h-8 bg-neutral-300 dark:bg-neutral-700 rounded shadow-sm" />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-6 h-6 bg-blue-400 rounded-full opacity-60" />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Stock chart loader</h2>
        <StockChartLoader title="Comparing AAPL vs MSFT" input={{ companies: ['AAPL', 'MSFT'] }} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Code interpreter (running)</h2>
        <CodeInterpreterView
          code={'import pandas as pd\n\ndf = pd.read_csv("data.csv")\ndf.describe()'}
          language="python"
          title="Analyzing dataset"
          status="running"
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Agent live session log (opencode-session-card.tsx)
        </h2>
        <p className="text-xs text-muted-foreground">
          Static reproduction only — the real component streams from a live session via SSE hooks
          (useLiveSessionTail), unsafe to mount against a fake session id here.
        </p>
        <div className="w-full max-w-lg rounded-xl border border-border/60 overflow-hidden bg-card/30">
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span className="truncate">Refactor the auth middleware</span>
          </div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto px-4 py-3 font-mono text-[11px]">
            <div className="italic text-muted-foreground">Reading lib/auth/middleware.ts...</div>
            <div>
              <Loader2 className="mr-1 inline size-2.5 animate-spin" />
              Running `pnpm tsc --noEmit`
            </div>
            <div className="text-amber-600 dark:text-amber-400">Waiting for permission to write file...</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Lookout running status badge
        </h2>
        <StatusBadge status="running" size="md" />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          X Wrapped analyzing splash
        </h2>
        <div className="relative flex h-56 w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-border">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <ColorPanels
              style={{ width: '100%', height: '100%' }}
              colors={['#786654', '#f5e6c8', '#d95545', '#c9a87c']}
              colorBack="#00000000"
              density={1.6}
              angle1={0.3}
              angle2={0.3}
              length={1}
              edges
              blur={0.25}
              fadeIn={0.85}
              fadeOut={0.3}
              gradient={0}
              speed={0.6}
              rotation={112}
            />
            <div className="absolute inset-0 bg-background/20" />
          </div>
          <Badge variant="outline" className="relative z-10 flex items-center gap-2 border-border/50 bg-background/70 text-sm">
            <Spinner className="size-4" />
            <TextLoop interval={2}>
              <TextShimmer>Analyzing @username...</TextShimmer>
              <TextShimmer>Searching through posts...</TextShimmer>
              <TextShimmer>Calculating insights...</TextShimmer>
              <TextShimmer>Almost there...</TextShimmer>
            </TextLoop>
          </Badge>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Voice page splash</h2>
        <div className="flex h-40 w-full flex-col items-center justify-center gap-4 rounded-lg border border-border bg-background">
          <ZetoraLogo className="size-10 animate-pulse motion-reduce:animate-none" />
          <p className="font-pixel text-xs text-muted-foreground/50 tracking-wider">Loading</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Streaming indicator</h2>
        <StreamingIndicator />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Skeletons</h2>
        <p className="text-xs text-muted-foreground">
          Real compositions (chat-history-dialog.tsx, app-sidebar.tsx) — not a generic swatch.
        </p>
        <div className="max-w-sm space-y-4 rounded-lg border border-border p-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Chat history row</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 grow items-center gap-2">
                <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-[180px]" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-[70px]" />
                <Skeleton className="h-7 w-7 rounded-full" />
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Sidebar item</p>
            <Skeleton className="h-4 w-full rounded bg-primary/10" />
          </div>
        </div>
      </section>
    </div>
  );
}
