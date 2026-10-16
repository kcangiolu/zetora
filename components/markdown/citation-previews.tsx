import Image from 'next/image';
import Link from 'next/link';
import React, { useCallback, useMemo, useState, Suspense, use } from 'react';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { ArrowUpRight, Download, Globe, Youtube, Loader2, X, MoreVertical, ExternalLink } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Cambio } from 'cambio';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  SpotifyIcon,
  getPlatformFromUrl,
  getDisplayDomain,
  getFilePreviewDefinition,
  getAppPreviewDescription,
} from './shared';

const isValidUrl = (str: string) => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

const metadataCache = new Map<string, Promise<any>>();

function fetchMetadata(url: string) {
  if (!metadataCache.has(url)) {
    metadataCache.set(
      url,
      fetch(`/api/link-metadata?url=${encodeURIComponent(url)}`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    );
  }
  return metadataCache.get(url)!;
}

// Preload metadata for all citation URLs in the content
export function preloadCitationMetadata(content: string) {
  // Extract all citation URLs from content
  const citationPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const urls = new Set<string>();
  let match;

  while ((match = citationPattern.exec(content)) !== null) {
    const url = match[2];
    if (isValidUrl(url)) {
      urls.add(url);
    }
  }

  // Start fetching metadata for all URLs in the background
  urls.forEach((url) => {
    fetchMetadata(url);
  });
}

const LinkPreviewContent = ({ href, title }: { href: string; title?: string }) => {
  const metadata = use(fetchMetadata(href));
  const [faviconError, setFaviconError] = useState(false);
  const [googleFaviconError, setGoogleFaviconError] = useState(false);
  const [proxyError, setProxyError] = useState(false);

  const domain = useMemo(() => {
    try {
      return new URL(href).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }, [href]);

  if (!domain) return null;

  const displayDomain = getDisplayDomain(domain);

  // Fallback to original text if metadata title is "Access Denied" or empty
  const isAccessDenied = metadata?.title === 'Access Denied';
  const displayTitle = metadata?.title && !isAccessDenied ? metadata.title : title;

  const metadataFavicon = metadata?.favicon;
  const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  // Determine favicon source based on error states
  let favicon: string;
  let useProxy = false;
  let showIcon = false;

  if (!faviconError && metadataFavicon) {
    // Try metadata favicon first
    favicon = metadataFavicon;
  } else if (!googleFaviconError) {
    // If metadata favicon failed/doesn't exist, try Google favicon
    favicon = googleFavicon;
  } else if (!proxyError && metadataFavicon) {
    // If Google also failed and we have a metadata favicon, try proxying it
    favicon = `/api/proxy-image?url=${encodeURIComponent(metadataFavicon)}`;
    useProxy = true;
  } else {
    // All failed, show globe icon
    showIcon = true;
    favicon = '';
  }

  const handleFaviconError = () => {
    if (metadataFavicon && !faviconError) {
      // Metadata logo failed, try Google next
      setFaviconError(true);
    } else if (!googleFaviconError) {
      // Google favicon failed, try proxy next
      setGoogleFaviconError(true);
    } else if (!proxyError) {
      // Proxy failed, show icon
      setProxyError(true);
    }
  };

  return (
    <div className="flex flex-col text-xs m-0">
      <div className="flex items-center gap-2 px-3 py-2">
        {showIcon ? (
          <div className="w-3.5 h-3.5 flex items-center justify-center text-muted-foreground/70">
            <Globe size={14} />
          </div>
        ) : useProxy ? (
          <img
            src={favicon}
            alt=""
            width={14}
            height={14}
            className="rounded-sm shrink-0"
            onError={handleFaviconError}
          />
        ) : (
          <Image
            src={favicon}
            alt=""
            width={14}
            height={14}
            className="rounded-sm shrink-0"
            onError={handleFaviconError}
          />
        )}
        <span className="truncate text-muted-foreground text-[10px]">{displayDomain}</span>
      </div>
      {displayTitle && (
        <div className="px-3 pb-2.5 pt-0">
          <h3 className="font-normal text-[11px] m-0 text-foreground/90 line-clamp-2 leading-relaxed">
            {displayTitle}
          </h3>
        </div>
      )}
    </div>
  );
};

export const LinkPreview = React.memo(({ href, title }: { href: string; title?: string }) => {
  const domain = useMemo(() => {
    try {
      return new URL(href).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }, [href]);

  const displayDomain = getDisplayDomain(domain);

  return (
    <Suspense
      fallback={
        <div className="flex flex-col text-xs m-0">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-3.5 h-3.5 bg-muted rounded-sm shrink-0 animate-pulse" />
            <span className="truncate text-muted-foreground text-[10px]">{displayDomain}</span>
          </div>
          <div className="px-3 pb-2.5 pt-0">
            <div className="h-3.5 w-3/4 bg-muted animate-pulse rounded"></div>
          </div>
        </div>
      }
    >
      <LinkPreviewContent href={href} title={title} />
    </Suspense>
  );
});

LinkPreview.displayName = 'LinkPreview';

export const AppLinkPreview = React.memo(({ href, title }: { href: string; title?: string }) => {
  const previewDescription = useMemo(() => getAppPreviewDescription(href), [href]);
  const previewTitle = title?.trim() && title.trim() !== href ? title.trim() : 'Open deployed app';

  return (
    <span className="inline-flex w-full max-w-full align-middle my-1">
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex w-full max-w-[420px] flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/40 no-underline transition-colors hover:bg-muted"
      >
        <span
          className="relative block w-full overflow-hidden border-b border-border/60 bg-muted/70"
          style={{ aspectRatio: '16/10' }}
        >
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,#ffffff14,transparent_55%),linear-gradient(180deg,#0f172a,#111827)] text-white/85">
            <Globe className="size-8 opacity-60" />
            <span className="px-4 text-center text-[11px] leading-relaxed text-white/50">Live app</span>
          </span>
          <span className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/35 to-transparent" />
        </span>
        <span className="flex items-center gap-2 px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background text-foreground/80">
            <Globe className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium text-foreground">{previewTitle}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{previewDescription}</span>
          </span>
          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </Link>
    </span>
  );
});

AppLinkPreview.displayName = 'AppLinkPreview';

// Mobile-friendly HoverCard component
// On desktop: uses uncontrolled mode so Radix manages hover state internally,
// which prevents streaming re-renders from closing the hover card.
// On mobile: uses controlled mode for tap-to-open behavior.
export const MobileHoverCard: React.FC<{
  href: string;
  text: React.ReactNode;
  isCitation?: boolean;
  citationText?: string;
}> = React.memo(({ href, text, isCitation = false, citationText }) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const title = citationText || (typeof text === 'string' ? text : '');

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (isMobile) {
        if (isOpen) {
          // If preview is already open, allow navigation
          // Don't prevent default, let the link work normally
          setIsOpen(false);
        } else {
          // First tap: show preview
          e.preventDefault();
          setIsOpen(true);
        }
      }
      // On desktop, let the link work normally (hover will show preview)
    },
    [isMobile, isOpen],
  );

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const linkClassName = isCitation
    ? 'cursor-pointer inline-flex items-center align-middle text-[10px] leading-tight font-medium no-underline px-1.5 py-[2px] mb-0.5! m-0! rounded-md bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 outline-none touch-manipulation'
    : 'text-primary/90 no-underline hover:text-primary font-medium transition-colors touch-manipulation rounded-sm px-0.5';

  // On mobile, use controlled mode for tap-to-open
  if (isMobile) {
    return (
      <HoverCard open={isOpen} onOpenChange={handleOpenChange}>
        <HoverCardTrigger asChild>
          <Link href={href} target="_blank" onClick={handleClick} className={linkClassName}>
            {text}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-60 p-0 shadow-md border border-border/60 rounded-lg overflow-hidden bg-popover"
          onClick={(e) => e.stopPropagation()}
        >
          <LinkPreview href={href} title={title} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  // On desktop, use uncontrolled mode so hover state survives parent re-renders during streaming
  return (
    <HoverCard openDelay={10}>
      <HoverCardTrigger asChild>
        <Link href={href} target="_blank" className={linkClassName}>
          {text}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-60 p-0 shadow-md border border-border/60 rounded-lg overflow-hidden bg-popover"
        onClick={(e) => e.stopPropagation()}
      >
        <LinkPreview href={href} title={title} />
      </HoverCardContent>
    </HoverCard>
  );
});

MobileHoverCard.displayName = 'MobileHoverCard';

interface CitationGroupProps {
  urls: string[];
  texts: string[];
  elementKey: string;
}

// Citation item with favicon fallback
const CitationItem = React.memo(
  ({
    url,
    text,
    domain,
    displayDomain,
    itemKey,
  }: {
    url: string;
    text: string;
    domain: string;
    displayDomain: string;
    itemKey: string;
  }) => {
    const [faviconError, setFaviconError] = useState(false);
    const [proxyError, setProxyError] = useState(false);
    const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const proxiedFavicon = `/api/proxy-image?url=${encodeURIComponent(googleFavicon)}`;
    const platform = getPlatformFromUrl(url);

    const handleError = () => {
      if (!faviconError) {
        setFaviconError(true);
      } else {
        setProxyError(true);
      }
    };

    // Platform-specific icon rendering
    const renderIcon = () => {
      if (platform === 'youtube') {
        return (
          <div className="w-[14px] h-[14px] flex items-center justify-center text-muted-foreground">
            <Youtube size={14} />
          </div>
        );
      }
      if (platform === 'spotify') {
        return (
          <div className="w-[14px] h-[14px] flex items-center justify-center text-muted-foreground">
            <SpotifyIcon className="w-[14px] h-[14px]" />
          </div>
        );
      }
      if (proxyError) {
        return (
          <div className="w-[14px] h-[14px] flex items-center justify-center text-muted-foreground">
            <Globe size={14} />
          </div>
        );
      }
      if (faviconError) {
        return (
          <img
            src={proxiedFavicon}
            alt=""
            width={14}
            height={14}
            className="rounded-sm shrink-0"
            onError={handleError}
          />
        );
      }
      return (
        <Image
          src={googleFavicon}
          alt=""
          width={14}
          height={14}
          className="rounded-sm shrink-0"
          onError={handleError}
        />
      );
    };

    // Platform-specific label
    const platformLabel = platform === 'youtube' ? 'YouTube' : platform === 'spotify' ? 'Spotify' : displayDomain;

    return (
      <Link
        key={itemKey}
        href={url}
        target="_blank"
        className="flex items-center gap-2 px-3 py-1.5! no-underline hover:bg-accent/50 active:bg-accent/50 transition-colors duration-150 touch-manipulation"
      >
        {renderIcon()}
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <h5 className="text-[11px] font-medium text-foreground truncate m-0 flex-1">{text}</h5>
          <span className="text-[9px] text-muted-foreground/60 m-0 shrink-0">{platformLabel}</span>
        </div>
      </Link>
    );
  },
);

CitationItem.displayName = 'CitationItem';

export const CitationGroup = React.memo(({ urls, texts, elementKey }: CitationGroupProps) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const firstDomain = useMemo(() => {
    try {
      const hostname = new URL(urls[0]).hostname.replace('www.', '');
      return getDisplayDomain(hostname);
    } catch {
      return getDisplayDomain(urls[0]);
    }
  }, [urls]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (isMobile) {
        if (isOpen) {
          // If preview is already open, close it
          setIsOpen(false);
        } else {
          // First tap: show preview
          e.preventDefault();
          setIsOpen(true);
        }
      }
    },
    [isMobile, isOpen],
  );

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const triggerContent = (
    <span
      onClick={isMobile ? handleClick : undefined}
      className="cursor-pointer inline-flex items-center align-middle gap-1 text-[10px] leading-tight font-medium no-underline px-1.5 py-[2px] mb-0.5! m-0! rounded-md bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 outline-none touch-manipulation"
    >
      <span>{firstDomain}</span>
      <span className="text-muted-foreground/50 text-[9px]">+{urls.length - 1}</span>
    </span>
  );

  const dropdownContent = (
    <div className="relative">
      <div className="px-3 py-0 border-b border-border/40">
        <span className="text-[10px] text-muted-foreground font-medium">{urls.length} sources</span>
      </div>
      <div className="max-h-[320px] overflow-y-auto divide-y divide-border/20">
        {urls.map((url, index) => {
          let domain = '';
          try {
            domain = new URL(url).hostname.replace('www.', '');
          } catch {
            domain = url;
          }

          const displayDomain = getDisplayDomain(domain);

          return (
            <CitationItem
              key={`${elementKey}-${index}`}
              url={url}
              text={texts[index]}
              domain={domain}
              displayDomain={displayDomain}
              itemKey={`${elementKey}-${index}`}
            />
          );
        })}
      </div>
    </div>
  );

  // On mobile, use controlled mode for tap-to-open
  if (isMobile) {
    return (
      <HoverCard open={isOpen} onOpenChange={handleOpenChange}>
        <HoverCardTrigger asChild>{triggerContent}</HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="w-64 p-0 shadow-md border border-border/60 rounded-lg overflow-hidden bg-popover"
          onClick={(e) => e.stopPropagation()}
        >
          {dropdownContent}
        </HoverCardContent>
      </HoverCard>
    );
  }

  // On desktop, use uncontrolled mode so hover state survives parent re-renders during streaming
  return (
    <HoverCard openDelay={10}>
      <HoverCardTrigger asChild>{triggerContent}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-64 p-0 shadow-md border border-border/60 rounded-lg overflow-hidden bg-popover"
        onClick={(e) => e.stopPropagation()}
      >
        {dropdownContent}
      </HoverCardContent>
    </HoverCard>
  );
});

CitationGroup.displayName = 'CitationGroup';

// Fetch image as blob and trigger a real download. Tries direct URL first; on CORS failure uses our proxy.
async function downloadFileBlob(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export const FileLinkPreview = React.memo(({ href, title }: { href: string; title?: string }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const preview = useMemo(() => getFilePreviewDefinition(href, title), [href, title]);

  const handleDownload = useCallback(async () => {
    if (!preview) return;

    setIsDownloading(true);
    try {
      await downloadFileBlob(href, preview.filename);
    } catch {
      window.open(href, '_blank', 'noopener,noreferrer');
    } finally {
      setIsDownloading(false);
    }
  }, [href, preview]);

  if (!preview) return null;

  const Icon = preview.icon;

  return (
    <span className="inline-flex max-w-full align-middle my-1">
      <span className="inline-flex max-w-[360px] items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-2.5 py-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-2 no-underline"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background text-foreground/80">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium text-foreground">{preview.title}</span>
            <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {preview.typeLabel} download
            </span>
          </span>
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0 rounded-lg"
          onClick={handleDownload}
        >
          {isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          <span className="sr-only">Download file</span>
        </Button>
      </span>
    </span>
  );
});

FileLinkPreview.displayName = 'FileLinkPreview';

async function downloadImageBlob(url: string, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors' });
  } catch {
    // CORS or network — fetch via same-origin proxy
    res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// Module-level cache so image dimensions survive component remounts during streaming.
// Keyed by src URL. Once an image's natural size is known it never needs to be measured again.
const imageSizeCache = new Map<string, { w: number; h: number }>();

// Inline image with Cambio shared animation expand and 3-dot dropdown for actions.
// Dimensions are cached at module level so remounts during streaming don't cause layout shift.
export const ImageWithPreview = React.memo(({ src, alt, title }: { src: string; alt?: string; title?: string }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Seed from cache so a remount is instant — no layout shift
  const cached = imageSizeCache.get(src);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(cached ?? null);

  const filename = useMemo(() => {
    const base = (alt || title || 'image').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const ext = src.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i)?.[1] || 'png';
    return `${base}.${ext}`;
  }, [alt, title, src]);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      imageSizeCache.set(src, size);
      setNaturalSize(size);
    },
    [src],
  );

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      await downloadImageBlob(src, filename);
    } catch {
      // CORS or network error — fall back to opening in new tab
      window.open(src, '_blank');
    } finally {
      setIsDownloading(false);
    }
  }, [src, filename]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(src, '_blank');
  }, [src]);

  // Lock layout: aspect-ratio from cache or 16:9 placeholder.
  // overflow-anchor:none tells the browser scroll-anchoring algo to ignore this element,
  // so recreating the <img> DOM node during streaming never pulls the viewport up.
  // contain:content prevents children from changing element size.
  const containerStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      contain: 'content',
      overflowAnchor: 'none',
    };
    if (naturalSize) {
      return { ...base, aspectRatio: `${naturalSize.w} / ${naturalSize.h}` };
    }
    return { ...base, aspectRatio: '16 / 9', maxHeight: '400px' };
  }, [naturalSize]);

  return (
    <span className="block my-2 relative group" style={{ overflowAnchor: 'none' }}>
      <Cambio.Root motion="smooth">
        <Cambio.Trigger
          className="w-full rounded-lg border border-border overflow-hidden cursor-zoom-in block bg-muted/30"
          style={containerStyle}
        >
          <img
            src={src}
            alt={alt || ''}
            title={title || undefined}
            className="w-full h-full object-contain p-0! m-0!"
            draggable={false}
            onLoad={handleLoad}
          />
        </Cambio.Trigger>
        <Cambio.Portal>
          <Cambio.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Cambio.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="relative">
              <img
                src={src}
                alt={alt || ''}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
                draggable={false}
              />
              <Cambio.Close className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </Cambio.Close>
            </div>
          </Cambio.Popup>
        </Cambio.Portal>
      </Cambio.Root>
      {/* 3-dot dropdown menu */}
      <span
        className={cn(
          'absolute top-2 right-2 rotate-90 transition-all duration-200',
          dropdownOpen
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0',
        )}
      >
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7 rounded-lg bg-background/95 backdrop-blur-md border border-border/50 shadow-none hover:bg-accent"
            >
              <MoreVertical className="h-3.5 w-3.5" />
              <span className="sr-only">Image options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {isDownloading ? 'Downloading...' : 'Download image'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenInNewTab}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      {alt && alt !== '' && alt !== 'img' && (
        <span className="block text-xs text-muted-foreground my-1 text-center">{alt}</span>
      )}
    </span>
  );
});

ImageWithPreview.displayName = 'ImageWithPreview';

// Swapped in for markdown images whose src matches one already rendered by a
// generate_image/edit_image tool card in the same message — models sometimes
// echo the image markdown despite being told not to. Re-rendering the <img>
// would duplicate it; rendering nothing would leave a dangling lead-in
// sentence ("Here's the image:") pointing at nothing. This keeps a single,
// useful affordance (download) without a second visual copy.
export const GeneratedImageDownloadChip = React.memo(({ src, alt }: { src: string; alt?: string }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const filename = useMemo(() => {
    const base = (alt || 'image').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const ext = src.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i)?.[1] || 'png';
    return `${base}.${ext}`;
  }, [alt, src]);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      await downloadImageBlob(src, filename);
    } catch {
      window.open(src, '_blank');
    } finally {
      setIsDownloading(false);
    }
  }, [src, filename]);

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isDownloading}
      className="inline-flex items-center gap-1.5 my-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-60"
    >
      {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      {isDownloading ? 'Downloading…' : 'Download image'}
    </button>
  );
});

GeneratedImageDownloadChip.displayName = 'GeneratedImageDownloadChip';
