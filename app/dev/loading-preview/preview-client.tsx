'use client';

import { useEffect, useRef, useState } from 'react';
import { Wand2, Pencil, Search, Globe, MapPin, Code } from 'lucide-react';
import { GeneratedImageCard, GeneratedImageCardProps } from '@/components/generated-image-card';
import { SearchLoadingState } from '@/components/tool-invocation-list-view';
import { StreamingIndicator } from '@/components/streaming-indicator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

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

const LOADER_COLORS = [
  { color: 'red' as const, icon: Search, text: 'Searching the web...' },
  { color: 'green' as const, icon: Globe, text: 'Fetching page...' },
  { color: 'orange' as const, icon: MapPin, text: 'Finding places...' },
  { color: 'violet' as const, icon: Wand2, text: 'Generating image...' },
  { color: 'gray' as const, icon: Code, text: 'Running code...' },
  { color: 'blue' as const, icon: Pencil, text: 'Editing image...' },
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
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Streaming indicator</h2>
        <StreamingIndicator />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Skeletons</h2>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
