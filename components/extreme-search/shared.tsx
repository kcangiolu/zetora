'use client';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import React, { useState, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, X, MoreVertical, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Cambio } from 'cambio';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';

export const Tweet = dynamic(() => import('react-tweet').then((mod) => ({ default: mod.Tweet })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[200px] rounded-lg border border-border bg-muted/30 animate-pulse flex items-center justify-center">
      <Spinner className="w-4 h-4" />
    </div>
  ),
});

// Custom minimal icons
export const Icons = {
  Globe: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  ExternalLink: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  ),
  ArrowUpRight: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 17L17 7M17 7H7M17 7v10" />
    </svg>
  ),
};

// Fetch image as blob and trigger a real download. Tries direct URL first; on CORS failure uses our proxy.
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

// Chart wrapper component with Cambio expand and 3-dot dropdown for actions
export const ChartWithFullView = memo(
  ({ chart, index }: { chart: any; index: number }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const chartTitle = chart.title || `Chart ${index + 1}`;
    const sanitizedTitle = chartTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const imageUrl = chart.url;

    const handleDownload = useCallback(async () => {
      if (!imageUrl) return;
      const filename = `${sanitizedTitle}.png`;

      setIsDownloading(true);
      try {
        await downloadImageBlob(imageUrl, filename);
      } catch {
        // CORS or network error — fall back to opening in new tab
        window.open(imageUrl, '_blank');
      } finally {
        setIsDownloading(false);
      }
    }, [imageUrl, sanitizedTitle]);

    const handleOpenInNewTab = useCallback(() => {
      if (imageUrl) window.open(imageUrl, '_blank');
    }, [imageUrl]);

    if (!imageUrl) return null;

    return (
      <div className="relative group h-full">
        <Cambio.Root motion="smooth">
          <Cambio.Trigger className="w-full h-full rounded-lg border border-border overflow-hidden cursor-zoom-in block bg-card shadow-none">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              <img
                src={imageUrl}
                alt={chartTitle}
                className="w-full h-full object-cover"
                draggable={false}
                loading="lazy"
              />
            </motion.div>
          </Cambio.Trigger>
          <Cambio.Portal>
            <Cambio.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
            <Cambio.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="relative">
                <img
                  src={imageUrl}
                  alt={chartTitle}
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
        <div
          className={cn(
            'absolute top-3 right-3 transition-all duration-200 rotate-90',
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
                <span className="sr-only">Chart options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem onClick={handleDownload} disabled={isDownloading}>
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {isDownloading ? 'Downloading...' : 'Download as PNG'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenInNewTab}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.chart?.url === next.chart?.url && prev.chart?.title === next.chart?.title && prev.index === next.index,
);

ChartWithFullView.displayName = 'ChartWithFullView';

// Types for Extreme Search
export interface ExtremeSearchSource {
  title: string;
  url: string;
  content: string; // 🔧 FIX: Content is always provided by the tool, should not be optional
  favicon?: string;
  publishedDate?: string;
  published_date?: string;
  author?: string;
}

// Utility function for favicon (matching multi-search)
const getFaviconUrl = (url: string) => {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
  } catch {
    return null;
  }
};

// Source Card Component for Extreme Search (minimal design)
export const ExtremeSourceCard: React.FC<{
  source: ExtremeSearchSource;
  onClick?: () => void;
}> = ({ source, onClick }) => {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const faviconUrl = source.favicon || getFaviconUrl(source.url);

  let hostname = '';
  try {
    hostname = new URL(source.url).hostname.replace('www.', '');
  } catch {
    hostname = source.url;
  }

  return (
    <div
      className={cn(
        'group py-3 px-4 flex items-start gap-3',
        'border-b border-border last:border-0',
        'hover:bg-accent/50 transition-colors duration-200',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
    >
      {/* Favicon */}
      <div className="relative w-5 h-5 mt-0.5 flex items-center justify-center shrink-0 rounded-md overflow-hidden bg-muted border border-border/50">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            width={16}
            height={16}
            className={cn('object-contain opacity-70', !imageLoaded && 'opacity-0')}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              setImageLoaded(true);
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Icons.Globe className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-medium text-sm text-foreground line-clamp-1">{source.title || hostname}</h3>
          <Icons.ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">
          {source.content || 'Loading content...'}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">{hostname}</span>
          {source.author && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="truncate">{source.author}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Sources Sheet Component for Extreme Search
export const ExtremeSourcesSheet: React.FC<{
  sources: ExtremeSearchSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ sources, open, onOpenChange }) => {
  const isMobile = useIsMobile();

  const SheetWrapper = isMobile ? Drawer : Sheet;
  const SheetContentWrapper = isMobile ? DrawerContent : SheetContent;

  return (
    <SheetWrapper open={open} onOpenChange={onOpenChange}>
      <SheetContentWrapper
        className={cn(isMobile ? 'h-[85vh]' : 'w-[600px] sm:max-w-[600px]', 'p-0 bg-background border-border')}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border bg-card">
            <div>
              <h2 className="text-lg font-semibold text-foreground">All Sources</h2>
              <p className="text-sm text-muted-foreground mt-1">{sources.length} research sources</p>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-background">
            <div className="divide-y divide-border">
              {sources.map((source, index) => (
                <a key={index} href={source.url} target="_blank" className="block">
                  <ExtremeSourceCard source={source} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </SheetContentWrapper>
    </SheetWrapper>
  );
};

export interface SearchQuery {
  id: string;
  query: string;
  index?: number;
  total?: number;
  status: 'started' | 'reading_content' | 'completed' | 'error';
  sources: ExtremeSearchSource[];
  content: Array<{ title: string; url: string; text: string; favicon?: string }>;
}

export interface CodeExecution {
  id: string;
  title: string;
  code: string;
  status: 'running' | 'completed' | 'error';
  result?: string;
  charts?: any[];
}

export interface ThinkingExecution {
  id: string;
  thought: string;
  nextStep?: string;
}

export interface DoneExecution {
  id: string;
  summary: string;
}

export interface XSearchExecution {
  id: string;
  query: string;
  index?: number;
  total?: number;
  startDate: string;
  endDate: string;
  handles?: string[];
  status: 'started' | 'completed' | 'error';
  result?: {
    content: string;
    citations: any[];
    sources: Array<{ text: string; link: string; title?: string }>;
    dateRange: string;
    handles: string[];
  };
}

export interface FileQueryExecution {
  id: string;
  query: string;
  index?: number;
  total?: number;
  status: 'started' | 'completed' | 'error';
  results?: Array<{
    fileName: string;
    content: string;
    score: number;
  }>;
}

export interface BrowsePageExecution {
  id: string;
  urls: string[];
  index?: number;
  total?: number;
  status: 'started' | 'browsing' | 'completed' | 'error';
  results?: Array<{
    url: string;
    title: string;
    content: string;
    favicon?: string;
    error?: string;
  }>;
}
