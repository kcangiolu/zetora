import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ChatMessage } from '@/lib/types';
import { getDisplayHostname, getHostFaviconUrl } from '@/lib/url';

export interface SourceItem {
  id: string;
  url: string;
  hostname: string;
  favicon: string;
  displayTitle: string;
}

type SourceMetadata = {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  favicon?: string;
};

// No backdrop-blur: it re-composites everything behind the pill on every scroll frame,
// once per message with sources. A flat, slightly more opaque background reads the same.
const triggerClassName =
  'h-8 w-auto gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

const cardClassName =
  'group block overflow-hidden rounded-xl border border-border/60 bg-card/30 p-3 transition-colors hover:bg-accent/40 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

function proxied(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

// The message's source-url parts, one per URL, with a readable title.
export function buildSourceItems(parts: ChatMessage['parts'], messageIndex: number): SourceItem[] {
  const items: SourceItem[] = [];
  parts.forEach((part, index) => {
    if (part.type !== 'source-url') return;
    const url = part.url?.trim();
    if (!url || items.some((item) => item.url === url)) return;

    const hostname = getDisplayHostname(url) || url;
    const rawTitle = part.title?.trim() || '';
    // A bare number or the URL itself is no title: "blog.rust-lang.org" reads "Blog · Rust-lang · Org".
    const displayTitle =
      rawTitle && !/^\d+$/.test(rawTitle) && rawTitle !== url
        ? rawTitle
        : hostname
            .split('.')
            .filter(Boolean)
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' · ');

    items.push({
      id: part.sourceId?.trim() || `source-${messageIndex}-${index}`,
      url,
      hostname,
      favicon: proxied(getHostFaviconUrl(hostname, 64)),
      displayTitle,
    });
  });
  return items;
}

async function fetchSourceMetadata(url: string): Promise<SourceMetadata> {
  try {
    const response = await fetch(`/api/link-metadata?url=${encodeURIComponent(url)}`);
    return response.ok ? ((await response.json()) as SourceMetadata) : {};
  } catch {
    return {};
  }
}

function SourceEntry({ source, index, metadata }: { source: SourceItem; index: number; metadata?: SourceMetadata }) {
  const title = metadata?.title?.trim() || metadata?.siteName?.trim() || source.displayTitle;
  const description = metadata?.description?.trim() || '';
  const favicon = metadata?.favicon?.trim() ? proxied(metadata.favicon) : source.favicon;
  const siteName = metadata?.siteName?.trim() || source.hostname;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open source ${index + 1}: ${title}`}
      className={cardClassName}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-6 min-w-6 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
          {index + 1}
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/80 shrink-0 overflow-hidden">
          <img
            src={favicon}
            alt=""
            className="size-4 rounded shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{title}</div>
              <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
                <span className="truncate">{siteName}</span>
                <span aria-hidden="true">•</span>
                <span className="truncate tabular-nums">{source.hostname}</span>
              </div>
            </div>
            <div className="shrink-0 text-[10px] font-medium text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100">
              Open
            </div>
          </div>

          {description && description !== siteName && description !== source.hostname && (
            <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{description}</div>
          )}

          <div className="mt-2 truncate text-[11px] text-muted-foreground/80" title={source.url}>
            {source.url}
          </div>
        </div>
      </div>
    </a>
  );
}

// Mounted when the sources open, so their pages' metadata is only fetched then.
function SourceList({ sources }: { sources: SourceItem[] }) {
  const [metadata, setMetadata] = useState<Record<string, SourceMetadata>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(sources.map(async (source) => [source.url, await fetchSourceMetadata(source.url)] as const)).then(
      (entries) => {
        if (!cancelled) setMetadata(Object.fromEntries(entries));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sources]);

  return (
    <div className="grid gap-2.5">
      {sources.map((source, index) => (
        <SourceEntry key={source.id} source={source} index={index} metadata={metadata[source.url]} />
      ))}
    </div>
  );
}

// The "Sources" button under an answer, opening its sources in a dialog (a drawer on mobile).
export function MessageSources({ sources }: { sources: SourceItem[] }) {
  const isMobile = useIsMobile();
  const trigger = (
    <Button variant="ghost" className={triggerClassName}>
      <Globe className="h-3.5 w-3.5" />
      <span>Sources</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{sources.length}</span>
    </Button>
  );
  const heading = (
    <>
      <Globe className="h-4 w-4 text-muted-foreground" />
      Sources
    </>
  );
  const subtitle = (
    <p className="text-sm text-muted-foreground text-pretty">References used to generate this response.</p>
  );

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-base">{heading}</DrawerTitle>
            {subtitle}
          </DrawerHeader>
          <div className="overflow-y-auto pb-1 px-4">
            <SourceList sources={sources} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">{heading}</DialogTitle>
          {subtitle}
        </DialogHeader>
        <div className="overflow-y-auto pb-1 max-h-[60vh] pr-1">
          <SourceList sources={sources} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
