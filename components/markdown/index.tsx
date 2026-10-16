import 'katex/dist/katex.min.css';

import Link from 'next/link';
import Marked, { ReactRenderer } from 'marked-react';
import React, { useCallback, useMemo, useState, Fragment, useRef, useEffect, use } from 'react';

import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Check, Youtube, Download } from 'lucide-react';
import { Cambio } from 'cambio';
import { useIsMobile } from '@/hooks/use-mobile';

import { CodeBlock, InlineCode, useProcessedContent, SafeLatex } from './code-block';
import {
  LinkPreview,
  AppLinkPreview,
  CitationGroup,
  FileLinkPreview,
  ImageWithPreview,
  GeneratedImageDownloadChip,
  MobileHoverCard,
  preloadCitationMetadata,
} from './citation-previews';
import { SpotifyIcon, getFilePreviewDefinition, getPlatformFromUrl, getDisplayDomain } from './shared';
import { getDisplayHostname } from '@/lib/url';

interface MarkdownRendererProps {
  content: string;
  isUserMessage?: boolean;
  // URLs already rendered by a generate_image/edit_image tool card in this
  // message — matching markdown images are swapped for a download-only chip
  // instead of duplicating the picture (see GeneratedImageDownloadChip).
  generatedImageUrls?: Set<string>;
}

const MarkdownTableWithActions: React.FC<{ children: React.ReactNode }> = React.memo(({ children }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isMobile = useIsMobile();

  const csvUtils = useMemo(
    () => ({
      escapeCsvValue: (value: string): string => {
        const needsQuotes = /[",\n]/.test(value);
        const escaped = value.replace(/"/g, '""');
        return needsQuotes ? `"${escaped}"` : escaped;
      },
      buildCsvFromTable: (table: HTMLTableElement): string => {
        const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
        const csvLines: string[] = [];
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('th,td')) as HTMLTableCellElement[];
          if (cells.length > 0) {
            const line = cells
              .map((cell) => csvUtils.escapeCsvValue(cell.innerText.replace(/\u00A0/g, ' ').trim()))
              .join(',');
            csvLines.push(line);
          }
        }
        return csvLines.join('\n');
      },
    }),
    [],
  );

  const handleDownloadCsv = useCallback(() => {
    const tableEl = containerRef.current?.querySelector('[data-slot="table"]') as HTMLTableElement | null;
    if (!tableEl) return;

    try {
      const csv = csvUtils.buildCsvFromTable(tableEl);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
      a.href = url;
      a.download = `table-${timestamp}.csv`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download CSV:', error);
    }
  }, [csvUtils]);

  const updateScrollIndicators = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    updateScrollIndicators();
    scrollEl.addEventListener('scroll', updateScrollIndicators);
    const resizeObserver = new ResizeObserver(updateScrollIndicators);
    resizeObserver.observe(scrollEl);

    return () => {
      scrollEl.removeEventListener('scroll', updateScrollIndicators);
      resizeObserver.disconnect();
    };
  }, [updateScrollIndicators]);

  const handleTouchStart = useCallback(() => {
    if (isMobile) {
      setShowActions((prev) => !prev);
    }
  }, [isMobile]);

  return (
    <div
      ref={containerRef}
      className="relative group my-2.5"
      onMouseEnter={() => !isMobile && setShowActions(true)}
      onMouseLeave={() => !isMobile && setShowActions(false)}
      onTouchStart={handleTouchStart}
    >
      <div
        className={cn(
          'absolute -top-3 -right-3 z-10 transition-opacity duration-200',
          showActions ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover:opacity-100',
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="size-7 text-xs shadow-sm rounded-sm"
              onClick={handleDownloadCsv}
              aria-label="Download CSV"
            >
              <Download className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={2}>
            Download CSV
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="border border-foreground/10 rounded-sm overflow-hidden">
        <div
          ref={scrollRef}
          className="relative overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
          style={{ scrollbarWidth: 'thin' }}
        >
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-background to-transparent pointer-events-none z-10" />
          )}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-background to-transparent pointer-events-none z-10" />
          )}
          <div>
            <Table className="m-0! min-w-full border-0! [&>div]:overflow-visible! [&>div]:relative! [&_tr]:border-foreground/10">
              {children}
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
});

MarkdownTableWithActions.displayName = 'MarkdownTableWithActions';

const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(
  ({ content, isUserMessage = false, generatedImageUrls }) => {
    const {
      processedContent,
      citations: extractedCitations,
      citationGroups,
      latexBlocks,
      appPreviewBlocks,
      downloadBlocks,
      isProcessing,
    } = useProcessedContent(content);
    const citationLinks = extractedCitations;

    // Preload metadata for all citation URLs as content streams in
    useEffect(() => {
      if (!isUserMessage && content) {
        preloadCitationMetadata(content);
      }
    }, [content, isUserMessage]);

    // Optimized element key generation using content hash instead of indices
    const contentHash = useMemo(() => {
      // Simple hash for stable keys
      let hash = 0;
      const str = content.slice(0, 200); // Use first 200 chars for hash
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }, [content]);

    // Use closures to maintain counters without re-creating on each render
    const getElementKey = useMemo(() => {
      const counters = {
        paragraph: 0,
        code: 0,
        heading: 0,
        list: 0,
        listItem: 0,
        blockquote: 0,
        table: 0,
        tableRow: 0,
        tableCell: 0,
        link: 0,
        text: 0,
        image: 0,
        hr: 0,
      };

      return (type: keyof typeof counters, content?: string) => {
        const count = counters[type]++;
        const contentPrefix = content ? content.slice(0, 20) : '';
        // For code blocks, use a content-based key WITHOUT contentHash to preserve state across re-renders
        // This prevents collapse state from resetting when other content changes
        if (type === 'code' && content) {
          let codeHash = 0;
          for (let i = 0; i < Math.min(content.length, 100); i++) {
            codeHash = ((codeHash << 5) - codeHash + content.charCodeAt(i)) | 0;
          }
          return `code-${Math.abs(codeHash).toString(36)}-${content.length}-${count}`;
        }
        // For images, use stable content-based keys WITHOUT contentHash
        // so Cambio expand state and image elements don't jank/remount during streaming
        if (type === 'image' && content) {
          let imgHash = 0;
          for (let i = 0; i < Math.min(content.length, 200); i++) {
            imgHash = ((imgHash << 5) - imgHash + content.charCodeAt(i)) | 0;
          }
          return `img-${Math.abs(imgHash).toString(36)}-${content.length}-${count}`;
        }
        // For table elements, use stable counter-based keys WITHOUT contentHash
        // so MarkdownTableWithActions copy/export state doesn't reset during streaming
        if (type === 'table' || type === 'tableRow' || type === 'tableCell') {
          return `${type}-${count}`;
        }
        // For links and citation groups, use content-based stable keys WITHOUT contentHash
        // so hover cards / citation group popovers don't get unmounted during streaming
        if (type === 'link' && content) {
          let linkHash = 0;
          for (let i = 0; i < Math.min(content.length, 100); i++) {
            linkHash = ((linkHash << 5) - linkHash + content.charCodeAt(i)) | 0;
          }
          return `link-${Math.abs(linkHash).toString(36)}-${count}`;
        }
        return `${contentHash}-${type}-${count}-${contentPrefix}`.replace(/[^a-zA-Z0-9-]/g, '');
      };
    }, [contentHash]);

    const renderHoverCard = useCallback(
      (href: string, text: React.ReactNode, isCitation: boolean = false, citationText?: string, stableKey?: string) => {
        return (
          <MobileHoverCard
            key={stableKey}
            href={href}
            text={text}
            isCitation={isCitation}
            citationText={citationText}
          />
        );
      },
      [],
    );

    const renderCitation = useCallback(
      (index: number, citationText: string, href: string, key: string) => {
        const platform = getPlatformFromUrl(href);

        // Special rendering for YouTube and Spotify
        if (platform === 'youtube' || platform === 'spotify') {
          const platformConfig =
            platform === 'youtube'
              ? { name: 'YouTube', icon: <Youtube className="w-3 h-3" /> }
              : { name: 'Spotify', icon: <SpotifyIcon className="w-3 h-3" /> };

          return (
            <HoverCard key={key} openDelay={10}>
              <HoverCardTrigger asChild>
                <Link
                  href={href}
                  target="_blank"
                  className="inline-flex items-center align-middle gap-1.5 px-1.5 py-[2px] mb-0.5! rounded-md text-[10px] leading-tight font-medium no-underline transition-colors bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {platformConfig.icon}
                  <span>{platformConfig.name}</span>
                </Link>
              </HoverCardTrigger>
              <HoverCardContent
                side="bottom"
                align="start"
                sideOffset={6}
                className="w-60 p-0 shadow-md border border-border/60 rounded-lg overflow-hidden bg-popover"
              >
                <LinkPreview href={href} title={citationText} />
              </HoverCardContent>
            </HoverCard>
          );
        }

        // Default citation rendering
        const displayDomain = getDisplayDomain(getDisplayHostname(href) || href);
        return renderHoverCard(href, displayDomain, true, citationText, key);
      },
      [renderHoverCard],
    );

    const renderer: Partial<ReactRenderer> = useMemo(
      () => ({
        text(text: string) {
          // Check if text contains any LaTeX patterns or citation groups without mutating regex state
          const hasLatex = text.includes('XLATEXBLOCKX') || text.includes('XLATEXINLINEX');
          const hasCitationGroup = text.includes('XCITATIONGRPX');
          const hasAppPreview = text.includes('XAPPPREVX');
          const hasDownload = text.includes('XDOWNLOADX');

          if (!hasLatex && !hasCitationGroup && !hasAppPreview && !hasDownload) {
            return text;
          }

          // Create fresh regex patterns for execution
          const blockPattern = /XLATEXBLOCKX(\d+)XEND/g;
          const inlinePattern = /XLATEXINLINEX(\d+)XEND/g;
          const citationGroupPattern = /XCITATIONGRPX(\d+)XEND/g;
          const appPreviewPattern = /XAPPPREVX(\d+)XEND/g;
          const downloadPattern = /XDOWNLOADX(\d+)XEND/g;

          const components: any[] = [];
          let lastEnd = 0;
          const allMatches: Array<{
            match: RegExpExecArray;
            type: 'latex-block' | 'latex-inline' | 'citation-group' | 'app-preview' | 'download';
          }> = [];

          let match;
          while ((match = blockPattern.exec(text)) !== null) {
            allMatches.push({ match, type: 'latex-block' });
          }
          while ((match = inlinePattern.exec(text)) !== null) {
            allMatches.push({ match, type: 'latex-inline' });
          }
          while ((match = citationGroupPattern.exec(text)) !== null) {
            allMatches.push({ match, type: 'citation-group' });
          }
          while ((match = appPreviewPattern.exec(text)) !== null) {
            allMatches.push({ match, type: 'app-preview' });
          }
          while ((match = downloadPattern.exec(text)) !== null) {
            allMatches.push({ match, type: 'download' });
          }

          allMatches.sort((a, b) => a.match.index - b.match.index);

          allMatches.forEach(({ match, type }) => {
            const fullMatch = match[0];
            const start = match.index;

            if (start > lastEnd) {
              const textContent = text.slice(lastEnd, start);
              const key = getElementKey('text', textContent);
              components.push(<span key={key}>{textContent}</span>);
            }

            if (type === 'citation-group') {
              const citationGroup = citationGroups.find((group) => group.id === fullMatch);
              if (citationGroup) {
                const key = getElementKey('link', citationGroup.id);
                components.push(
                  <CitationGroup key={key} urls={citationGroup.urls} texts={citationGroup.texts} elementKey={key} />,
                );
              }
            } else if (type === 'app-preview') {
              const appPreview = appPreviewBlocks.find((block) => block.id === fullMatch);
              if (appPreview) {
                const key = getElementKey('link', appPreview.id);
                components.push(<AppLinkPreview key={key} href={appPreview.href} title={appPreview.title} />);
              }
            } else if (type === 'download') {
              const download = downloadBlocks.find((block) => block.id === fullMatch);
              if (download) {
                const key = getElementKey('link', download.id);
                components.push(<FileLinkPreview key={key} href={download.href} title={download.title} />);
              }
            } else {
              const latexBlock = latexBlocks.find((block) => block.id === fullMatch);
              if (latexBlock) {
                const key = getElementKey('text', latexBlock.content);
                if (type === 'latex-block') {
                  components.push(
                    <SafeLatex
                      key={key}
                      delimiters={[
                        { left: '$$', right: '$$', display: true },
                        { left: '\\[', right: '\\]', display: true },
                      ]}
                      isBlock={true}
                    >
                      {latexBlock.content}
                    </SafeLatex>,
                  );
                } else {
                  components.push(
                    <SafeLatex
                      key={key}
                      delimiters={[
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                      ]}
                      isBlock={false}
                    >
                      {latexBlock.content}
                    </SafeLatex>,
                  );
                }
              }
            }

            lastEnd = start + fullMatch.length;
          });

          if (lastEnd < text.length) {
            const textContent = text.slice(lastEnd);
            const key = getElementKey('text', textContent);
            components.push(<span key={key}>{textContent}</span>);
          }

          return components.length === 1 ? (
            components[0]
          ) : (
            <Fragment key={getElementKey('text', text)}>{components}</Fragment>
          );
        },
        hr() {
          return <Fragment key={getElementKey('hr')} />;
        },
        paragraph(children) {
          const key = getElementKey('paragraph', String(children));

          if (typeof children === 'string') {
            const blockMatch = children.match(/^XLATEXBLOCKX(\d+)XEND$/);
            if (blockMatch) {
              const latexBlock = latexBlocks.find((block) => block.id === children);
              if (latexBlock && latexBlock.isBlock) {
                return (
                  <div className="my-6 text-center" key={key}>
                    <SafeLatex
                      delimiters={[
                        { left: '$$', right: '$$', display: true },
                        { left: '\\[', right: '\\]', display: true },
                      ]}
                      isBlock={true}
                    >
                      {latexBlock.content}
                    </SafeLatex>
                  </div>
                );
              }
            }
          }

          return (
            <p
              key={key}
              className={`${isUserMessage ? 'leading-relaxed text-foreground mt-0 mb-1.5 last:mb-0' : 'pb-1 m-0!'} text-[15px] leading-[1.75] text-foreground/95`}
            >
              {children}
            </p>
          );
        },
        code(children, language) {
          const key = getElementKey('code', String(children));
          return (
            <CodeBlock language={language} elementKey={key} key={key}>
              {String(children)}
            </CodeBlock>
          );
        },
        codespan(code) {
          const codeString = typeof code === 'string' ? code : String(code || '');
          const key = getElementKey('code', codeString);
          return <InlineCode key={key} elementKey={key} code={codeString} />;
        },
        link(href, text) {
          const key = getElementKey('link', href);

          if (href.startsWith('mailto:')) {
            const email = href.replace('mailto:', '');
            return (
              <span key={key} className="break-all">
                {email}
              </span>
            );
          }

          const linkText = typeof text === 'string' ? text : href;
          const filePreview = getFilePreviewDefinition(href, typeof text === 'string' ? text : undefined);

          // For user messages, keep raw text to avoid accidental linkification changes
          if (isUserMessage) {
            if (linkText !== href && linkText !== '') {
              return (
                <span key={key} className="inline-block">
                  {linkText} ({href})
                </span>
              );
            }
            return (
              <span key={key} className="inline-block">
                {href}
              </span>
            );
          }

          if (filePreview) {
            return <FileLinkPreview key={key} href={href} title={linkText} />;
          }

          // If there's descriptive link text, render a normal anchor with hover preview.
          // This preserves full text inside tables and prevents truncation to citation chips.
          if (linkText && linkText !== href) {
            return renderHoverCard(href, linkText, false, undefined, key);
          }

          // For bare URLs, render as citation chips
          let citationIndex = citationLinks.findIndex((link) => link.link === href);
          if (citationIndex === -1) {
            citationLinks.push({ text: href, link: href });
            citationIndex = citationLinks.length - 1;
          }
          const citationText = citationLinks[citationIndex].text;
          return renderCitation(citationIndex, citationText, href, key);
        },
        image(src, alt, title) {
          const key = getElementKey('image', String(src));
          if (!src) return <span key={key} />;
          if (generatedImageUrls?.has(src)) {
            return <GeneratedImageDownloadChip key={key} src={src} alt={alt || undefined} />;
          }
          return <ImageWithPreview key={key} src={src} alt={alt || undefined} title={title || undefined} />;
        },
        heading(children, level) {
          const key = getElementKey('heading', String(children));
          const HeadingTag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
          const sizeClasses =
            {
              1: 'text-[18px] md:text-[22px] font-semibold! my-5!',
              2: 'text-[16px] md:text-[18px] font-semibold! my-4!',
              3: 'text-[15px] md:text-[16px] font-semibold! my-3.5!',
              4: 'text-[14px] md:text-[15px] font-medium my-3!',
              5: 'text-[13px] md:text-[14px] font-medium my-3!',
              6: 'text-[12px] md:text-[13px] font-medium my-3!',
            }[level] || '';

          return (
            <HeadingTag key={key} className={`${sizeClasses} text-foreground tracking-tight scroll-mt-20`}>
              {children}
            </HeadingTag>
          );
        },
        list(children, ordered) {
          const key = getElementKey('list');
          const ListTag = ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={key}
              className={cn(
                'my-6 space-y-3 text-foreground',
                ordered ? 'pl-8' : 'pl-8 list-disc marker:text-primary/70',
              )}
            >
              {children}
            </ListTag>
          );
        },
        listItem(children) {
          const key = getElementKey('listItem');
          return (
            <li key={key} className="pl-2 text-[15px] leading-relaxed text-foreground/90">
              <span className="inline">{children}</span>
            </li>
          );
        },
        blockquote(children) {
          const key = getElementKey('blockquote');
          return (
            <blockquote
              key={key}
              className="my-3 border-l-2 border-border/40 pl-3 text-[14px] leading-relaxed text-muted-foreground"
            >
              {children}
            </blockquote>
          );
        },
        strong(children) {
          const key = getElementKey('text', String(children));
          return (
            <strong key={key} className="font-medium text-foreground">
              {children}
            </strong>
          );
        },
        em(children) {
          const key = getElementKey('text', String(children));
          return (
            <em key={key} className="italic text-foreground/95">
              {children}
            </em>
          );
        },
        table(children) {
          const key = getElementKey('table');
          return <MarkdownTableWithActions key={key}>{children}</MarkdownTableWithActions>;
        },
        tableRow(children) {
          const key = getElementKey('tableRow');
          return <TableRow key={key}>{children}</TableRow>;
        },
        tableCell(children, flags) {
          const key = getElementKey('tableCell');
          const alignClass = flags.align ? `text-${flags.align}` : 'text-left';
          const isHeader = flags.header;

          // Map children with stable keys
          const childrenWithKeys = Array.isArray(children)
            ? children.map((child, index) => <React.Fragment key={`${key}-child-${index}`}>{child}</React.Fragment>)
            : children;

          return isHeader ? (
            <TableHead
              key={key}
              className={cn(
                alignClass,
                'text-[15px] border-r border-foreground/10 last:border-r-0 bg-foreground/6 font-semibold p-2! m-1! whitespace-normal wrap-break-word min-w-[120px]',
              )}
            >
              {childrenWithKeys}
            </TableHead>
          ) : (
            <TableCell
              key={key}
              className={cn(
                alignClass,
                'text-[15px] border-r border-foreground/10 last:border-r-0 p-2! m-1! whitespace-normal wrap-break-word min-w-[120px]',
              )}
            >
              {childrenWithKeys}
            </TableCell>
          );
        },
        tableHeader(children) {
          const key = getElementKey('table');
          return (
            <TableHeader key={key} className="p-1! m-1!">
              {children}
            </TableHeader>
          );
        },
        tableBody(children) {
          const key = getElementKey('table');
          return (
            <TableBody key={key} className="text-wrap! m-1!">
              {children}
            </TableBody>
          );
        },
      }),
      [
        latexBlocks,
        citationGroups,
        appPreviewBlocks,
        downloadBlocks,
        isUserMessage,
        renderCitation,
        renderHoverCard,
        getElementKey,
        citationLinks,
        generatedImageUrls,
      ],
    );

    // Show a progressive loading state for large content
    if (isProcessing && content.length > 15000) {
      return (
        <div className="markdown-body prose prose-neutral dark:prose-invert max-w-none text-foreground font-sans">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
              Processing content ({Math.round(content.length / 1024)}KB)...
            </div>
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-full"></div>
              <div className="h-3 bg-muted rounded w-5/6"></div>
              <div className="h-8 bg-muted rounded w-2/3"></div>
              <div className="h-3 bg-muted rounded w-4/5"></div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className="markdown-body prose prose-neutral dark:prose-invert max-w-none text-foreground font-sans"
        style={{ overflowAnchor: 'none' }}
      >
        <Marked renderer={renderer} breaks={isUserMessage}>
          {processedContent}
        </Marked>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.content === nextProps.content && prevProps.isUserMessage === nextProps.isUserMessage;
  },
);

MarkdownRenderer.displayName = 'MarkdownRenderer';

// Virtual scrolling component for very large content
const VirtualMarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(
  ({ content, isUserMessage = false }) => {
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Split content into chunks for virtual scrolling
    const contentChunks = useMemo(() => {
      const lines = content.split('\n');
      const chunkSize = 20; // Lines per chunk
      const chunks = [];

      for (let i = 0; i < lines.length; i += chunkSize) {
        chunks.push(lines.slice(i, i + chunkSize).join('\n'));
      }

      return chunks;
    }, [content]);

    const handleScroll = useCallback(() => {
      if (!containerRef.current) return;

      const { scrollTop, clientHeight } = containerRef.current;
      const lineHeight = 24; // Approximate line height
      const start = Math.floor(scrollTop / lineHeight);
      const end = Math.min(start + Math.ceil(clientHeight / lineHeight) + 10, contentChunks.length);

      setVisibleRange({ start: Math.max(0, start - 5), end });
    }, [contentChunks.length]);

    // Only use virtual scrolling for very large content
    if (content.length < 50000) {
      return <MarkdownRenderer content={content} isUserMessage={isUserMessage} />;
    }

    return (
      <div
        ref={containerRef}
        className="markdown-body prose prose-neutral dark:prose-invert max-w-none text-foreground font-sans max-h-96 overflow-y-auto"
        onScroll={handleScroll}
      >
        {contentChunks.slice(visibleRange.start, visibleRange.end).map((chunk, index) => (
          <MarkdownRenderer key={`chunk-${visibleRange.start + index}`} content={chunk} isUserMessage={isUserMessage} />
        ))}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.content === nextProps.content && prevProps.isUserMessage === nextProps.isUserMessage;
  },
);

VirtualMarkdownRenderer.displayName = 'VirtualMarkdownRenderer';

// Performance monitoring hook
const usePerformanceMonitor = (content: string) => {
  const renderStartTime = useRef<number>(0);

  useEffect(() => {
    renderStartTime.current = performance.now();
  }, [content]);

  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    if (renderTime > 100) {
      console.warn(`Markdown render took ${renderTime.toFixed(2)}ms for ${content.length} characters`);
    }
  }, [content.length]);
};

// Main optimized markdown component with automatic optimization selection
const OptimizedMarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(
  ({ content, isUserMessage = false }) => {
    usePerformanceMonitor(content);

    // Automatically choose the best rendering strategy based on content size
    if (content.length > 100000) {
      return <VirtualMarkdownRenderer content={content} isUserMessage={isUserMessage} />;
    }

    return <MarkdownRenderer content={content} isUserMessage={isUserMessage} />;
  },
  (prevProps, nextProps) => {
    return prevProps.content === nextProps.content && prevProps.isUserMessage === nextProps.isUserMessage;
  },
);

OptimizedMarkdownRenderer.displayName = 'OptimizedMarkdownRenderer';

export { MarkdownRenderer };
/** @public size-based Markdown/Virtual switcher — not yet wired into any call site, kept for future adoption */
export { VirtualMarkdownRenderer, OptimizedMarkdownRenderer as default };
