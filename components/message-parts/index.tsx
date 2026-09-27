import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import isEqual from 'fast-deep-equal';
import { ReasoningUIPart, DataUIPart, isStaticToolUIPart } from 'ai';
import { ReasoningPartView } from '@/components/reasoning-part';
import { MarkdownRenderer } from '@/components/markdown';
import { ChatTextHighlighter } from '@/components/chat-text-highlighter';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { deleteTrailingMessages, branchOutChat, updateMessageParts } from '@/app/actions';
import { sileo } from 'sileo';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ShareButton } from '@/components/share';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CpuIcon, Robot01Icon, SplitIcon } from '@hugeicons/core-free-icons';
import {
  ChatMessage,
  CustomUIDataTypes,
  DataQueryCompletionPart,
  DataExtremeSearchPart,
  HermesPromptData,
  HermesMediaData,
} from '@/lib/types';
import { SPEC_DATA_PART_TYPE } from '@json-render/core';
import { useSpeech } from '@/hooks/use-speech';
import { extractSpeakableText } from '@/lib/speakable-text';
import { UseChatHelpers } from '@ai-sdk/react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// Tool-specific components (eagerly loaded for better UX)
import { SearchLoadingState } from '@/components/tool-invocation-list-view';
import { GeneratedImageCard } from '@/components/generated-image-card';
import { StreamingIndicator } from '@/components/streaming-indicator';
import {
  MapPin,
  Film,
  Tv,
  Cloud,
  DollarSign,
  TrendingUpIcon,
  Plane,
  User2,
  Loader2,
  Clock,
  Globe,
  YoutubeIcon,
  Info,
  Code,
  Copy,
  Check,
  X,
  AlertCircle,
  Volume2,
  Square,
  Sparkles,
  Trash2,
  Download,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ClockIcon as PhosphorClockIcon,
  MemoryIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  SigmaIcon,
  FilePdf,
  FileDoc,
  FileMd,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getModelConfig } from '@/ai/models';
import { ComprehensiveUserData } from '@/lib/user-data-server';
import { useIsMobile } from '@/hooks/use-mobile';
import { Spinner } from '../ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';

// Eagerly load tool components for better UX (except browser-only components)
import dynamic from 'next/dynamic';
import { FlightTracker } from '@/components/flight-tracker';
import TMDBResult from '@/components/movie-info';
import MultiSearch from '@/components/multi-search';
import TrendingResults from '@/components/trending-tv-movies-results';
import AcademicPapersCard from '@/components/academic-papers';
import WeatherChart from '@/components/weather-chart';
import RedditSearch from '@/components/reddit-search';
import GitHubSearch from '@/components/github-search';
import PredictionSearch from '@/components/prediction-search';
import { TextTranslate } from '@/components/text-translate';
import XSearch from '@/components/x-search';
import { ExtremeSearch } from '@/components/extreme-search';
import { CoinData as CryptoCoinsData } from '@/components/crypto-coin-data';
import { CurrencyConverter } from '@/components/currency_conv';
import { YouTubeSearchResults } from '@/components/youtube-search-results';
import { SpotifySearchResults } from '@/components/spotify-search-results';
import { ConnectorsSearchResults } from '@/components/connectors-search-results';
import { CodeInterpreterView, NearbySearchSkeleton } from '@/components/tool-invocation-list-view';
import { RetrieveResults } from '@/components/retrieve-results';
import FileQuerySearch from '@/components/file-query-search';
import { useDataStream } from '../data-stream-provider';
import {
  XaiMultiAgentToolPart,
  isToolPartType,
  isSourcePartType,
  isXaiMultiAgentToolPart,
  getXaiMultiAgentToolLabel,
  IconArrowInbox,
  CopyIcon,
  TryAgainIcon,
  StockChartLoader,
  ToolErrorDisplay,
  formatDynamicToolName,
} from './shared';
import { getPendingInlineElicitations, toImageCardState } from './mcp';
import { HermesPromptCard } from './hermes-prompt';
import { HermesMediaCard } from './hermes-media';
import { DynamicToolInvocationCard, DynamicToolStepper, CanvasSpecRenderer, CodeContextTool } from './tools';
import type { McpTimelineEntry } from './tools';

type SourceUIPart = {
  type: 'source-url';
  sourceType?: string;
  id?: string;
  url?: string;
  title?: string;
};

type SourceItem = {
  id: string;
  url: string;
  title: string;
  hostname: string;
  favicon: string;
  displayTitle: string;
};

type SourceMetadata = {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  favicon?: string;
};

// No backdrop-blur: it forces the browser to re-composite everything behind this pill
// on every scroll frame — a well-documented mobile-scroll-jank source, worse the more
// instances are on screen at once (one per message with sources). A flat, slightly more
// opaque background reads the same without that cost.
const sourceDialogTriggerClassName =
  'h-8 rounded-full border border-border/60 bg-background/70 px-2.5 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

const sourceCardClassName =
  'group block overflow-hidden rounded-xl border border-border/60 bg-card/30 p-3 transition-colors hover:bg-accent/40 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

const sourcePanelBodyClassName = 'overflow-y-auto pb-1';
const sourcePanelListClassName = 'grid gap-2.5';

// Components that require browser APIs (Leaflet, charts) - load dynamically with ssr: false
const InteractiveChart = dynamic(() => import('@/components/interactive-charts'), { ssr: false });
const MapComponent = dynamic(() => import('@/components/map-components').then((m) => ({ default: m.MapComponent })), {
  ssr: false,
});
const NearbySearchMapView = dynamic(() => import('@/components/nearby-search-map-view'), { ssr: false });
const InteractiveStockChart = dynamic(() => import('@/components/interactive-stock-chart'), { ssr: false });
const CryptoChart = dynamic(() => import('@/components/crypto-charts').then((m) => ({ default: m.CryptoChart })), {
  ssr: false,
});
const CryptoTickers = dynamic(() => import('@/components/crypto-charts').then((m) => ({ default: m.CryptoTickers })), {
  ssr: false,
});

interface MessagePartRendererProps {
  part: ChatMessage['parts'][number];
  messageIndex: number;
  partIndex: number;
  parts: ChatMessage['parts'][number][];
  message: ChatMessage;
  status: string;
  hasActiveToolInvocations: boolean;
  reasoningVisibilityMap: Record<string, boolean>;
  reasoningFullscreenMap: Record<string, boolean>;
  setReasoningVisibilityMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setReasoningFullscreenMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  messages: ChatMessage[];
  user?: ComprehensiveUserData;
  isOwner?: boolean;
  selectedVisibilityType?: 'public' | 'private';
  chatId?: string;
  hiddenImageUrls?: Set<string>;
  onToggleImageHidden?: (imageUrl: string, hidden: boolean) => void;
  onVisibilityChange?: (visibility: 'public' | 'private') => void;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  setSuggestedQuestions: (questions: string[]) => void;
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  // See messages.tsx's own isHermesChat comment: regenerate() always targets
  // /api/search, which a Hermes-mode chat never uses.
  isHermesChat?: boolean;
  stop: UseChatHelpers<ChatMessage>['stop'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  onHighlight?: (text: string) => void;
  annotations?: DataUIPart<CustomUIDataTypes>[];
}

export const MessagePartRenderer = memo<MessagePartRendererProps>(
  ({
    part,
    messageIndex,
    partIndex,
    parts,
    message,
    status,
    hasActiveToolInvocations,
    reasoningVisibilityMap,
    reasoningFullscreenMap,
    setReasoningVisibilityMap,
    setReasoningFullscreenMap,
    messages,
    user,
    isOwner,
    selectedVisibilityType,
    chatId,
    hiddenImageUrls,
    onToggleImageHidden,
    onVisibilityChange,
    setMessages,
    setSuggestedQuestions,
    regenerate,
    isHermesChat = false,
    stop,
    sendMessage,
    onHighlight,
    annotations,
  }) => {
    const { dataStream } = useDataStream();
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isBranchingOut, setIsBranchingOut] = useState(false);
    const [isDeletingMessage, setIsDeletingMessage] = useState(false);
    // Edit-in-place (no regenerate) for a message's final text or reasoning —
    // unlike MessageEditor (user messages), this never deletes trailing
    // messages or calls regenerate, it only overwrites the stored part(s).
    const [isEditingText, setIsEditingText] = useState(false);
    const [textEditDraft, setTextEditDraft] = useState('');
    const [isSavingTextEdit, setIsSavingTextEdit] = useState(false);
    const [isEditingReasoning, setIsEditingReasoning] = useState(false);
    const [reasoningEditDraft, setReasoningEditDraft] = useState('');
    const [isSavingReasoningEdit, setIsSavingReasoningEdit] = useState(false);
    // Collapsed by default — a compaction-summary message's text part reuses
    // isEditingText/textEditDraft/isSavingTextEdit above for its edit flow,
    // this only controls whether the summary body is shown or just the
    // "Summary of N earlier messages" header.
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

    const persistMessageParts = useCallback(
      async (updatedParts: ChatMessage['parts']) => {
        setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, parts: updatedParts } : m)));
        if (user && message.id) {
          await updateMessageParts({ id: message.id, parts: updatedParts });
        }
      },
      [message.id, setMessages, user],
    );
    const { speak, stop: stopSpeech, isSpeaking, isLoading } = useSpeech();
    const [inlineElicitationVersion, setInlineElicitationVersion] = useState(0);
    const ignoredInlineElicitationIdsRef = useRef<Set<string>>(new Set());
    const router = useRouter();
    const queryClient = useQueryClient();
    const isMobile = useIsMobile();
    // inlineElicitationVersion isn't read in the body — it's a manual
    // invalidation counter that forces recomputation when
    // ignoredInlineElicitationIdsRef.current (a ref) changes.
    const inlineElicitations = useMemo(
      () => getPendingInlineElicitations(dataStream ?? [], ignoredInlineElicitationIdsRef.current),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [dataStream, inlineElicitationVersion],
    );
    const meta = message?.metadata;
    const modelConfig = meta?.model ? getModelConfig(meta.model) : null;
    const modelLabel = modelConfig?.label ?? meta?.model ?? null;
    const tokenTotal = (meta?.totalTokens ?? (meta?.inputTokens ?? 0) + (meta?.outputTokens ?? 0)) || null;
    const inputCount = meta?.inputTokens ?? null;
    const outputCount = meta?.outputTokens ?? null;
    const completionTime = meta?.completionTime ?? null;
    // A Hermes reply carries no model or token data (the relay wire has none); what it
    // has is provenance and timing, which is what its info popover shows instead.
    const hermesGatewayId = meta?.hermesGatewayId ?? null;
    const hermesReceivedAt =
      hermesGatewayId && meta?.createdAt
        ? new Date(meta.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        : null;
    const hasResponseInfo = Boolean(
      modelLabel || completionTime !== null || inputCount !== null || outputCount !== null || hermesGatewayId,
    );
    const sourceItems = useMemo(
      () =>
        parts.reduce<SourceItem[]>((acc, messagePart, sourceIndex) => {
          if (messagePart.type !== 'source-url') return acc;
          const sourcePart = messagePart as SourceUIPart;
          const url = sourcePart.url?.trim();
          if (!url) return acc;

          let hostname = url;
          try {
            hostname = new URL(url).hostname.replace(/^www\./, '');
          } catch {}

          const favicon = `/api/proxy-image?url=${encodeURIComponent(
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
          )}`;

          const rawTitle = sourcePart.title?.trim() || '';
          const displayTitle =
            rawTitle && !/^\d+$/.test(rawTitle) && rawTitle !== url
              ? rawTitle
              : hostname
                  .split('.')
                  .filter(Boolean)
                  .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
                  .join(' · ');

          if (acc.some((existing) => existing.url === url)) {
            return acc;
          }

          acc.push({
            id: sourcePart.id?.trim() || `source-${messageIndex}-${sourceIndex}`,
            url,
            title: rawTitle || hostname,
            hostname,
            favicon,
            displayTitle,
          });
          return acc;
        }, []),
      [parts, messageIndex],
    );
    const [sourceMetadataMap, setSourceMetadataMap] = useState<Record<string, SourceMetadata>>({});
    const renderSourceEntry = useCallback(
      (source: SourceItem, index: number) => {
        const metadata = sourceMetadataMap[source.url];
        const title = metadata?.title?.trim() || metadata?.siteName?.trim() || source.displayTitle;
        const description = metadata?.description?.trim() || '';
        const favicon = metadata?.favicon?.trim()
          ? `/api/proxy-image?url=${encodeURIComponent(metadata.favicon)}`
          : source.favicon;
        const siteName = metadata?.siteName?.trim() || source.hostname;

        return (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open source ${index + 1}: ${title}`}
            className={sourceCardClassName}
          >
            <div className="flex items-start gap-2.5">
              <div className="flex h-6 min-w-6 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
                {index + 1}
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/80 shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={favicon}
                  alt=""
                  className="size-4 rounded shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
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
      },
      [sourceMetadataMap],
    );

    useEffect(() => {
      if (sourceItems.length === 0) {
        setSourceMetadataMap({});
        return;
      }

      let cancelled = false;

      const loadSourceMetadata = async () => {
        const entries = await Promise.all(
          sourceItems.map(async (source) => {
            try {
              const response = await fetch(`https://metadata.zetora.app/?url=${encodeURIComponent(source.url)}`, {
                cache: 'force-cache',
              });

              if (!response.ok) {
                return [source.url, {} satisfies SourceMetadata] as const;
              }

              const payload = (await response.json()) as SourceMetadata;
              return [source.url, payload] as const;
            } catch {
              return [source.url, {} satisfies SourceMetadata] as const;
            }
          }),
        );

        if (cancelled) return;

        setSourceMetadataMap(Object.fromEntries(entries));
      };

      void loadSourceMetadata();

      return () => {
        cancelled = true;
      };
    }, [sourceItems]);

    const xaiToolParts = useMemo(() => parts.filter(isXaiMultiAgentToolPart) as XaiMultiAgentToolPart[], [parts]);
    const firstXaiToolIndex = useMemo(() => parts.findIndex(isXaiMultiAgentToolPart), [parts]);
    const lastXaiToolIndex = useMemo(() => parts.findLastIndex(isXaiMultiAgentToolPart), [parts]);
    const isWithinXaiToolRun =
      firstXaiToolIndex !== -1 &&
      lastXaiToolIndex !== -1 &&
      partIndex >= firstXaiToolIndex &&
      partIndex <= lastXaiToolIndex;

    // Automatic context-compaction summary (lib/search/context-compaction.ts):
    // a synthetic assistant message with a single text part, flagged via
    // message.metadata.isCompactionSummary. Rendered as a distinct
    // collapsible/editable card instead of a normal assistant bubble — the
    // edit flow reuses the exact same isEditingText/textEditDraft/
    // isSavingTextEdit state and persistMessageParts() call as the plain
    // "edit response text" flow below (updateMessageParts already restricts
    // edits to assistant messages, which this is).
    if (part.type === 'text' && message.metadata?.isCompactionSummary) {
      const replacedCount = message.metadata.compactionReplacedCount ?? 0;
      const canEditSummary = (user && isOwner) || (!user && selectedVisibilityType === 'private');

      return (
        <Card key={`${messageIndex}-${partIndex}-compaction-summary`} className="my-2 gap-0 border-dashed py-3">
          <CardHeader
            className="flex cursor-pointer flex-row items-center justify-between gap-2 px-4"
            onClick={() => setIsSummaryExpanded((v) => !v)}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Summary of {replacedCount} earlier message{replacedCount === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-1">
              {canEditSummary && !isEditingText && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  title="Edit summary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTextEditDraft(part.text);
                    setIsEditingText(true);
                    setIsSummaryExpanded(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              {isSummaryExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {(isSummaryExpanded || isEditingText) && (
            <CardContent className="px-4 pt-2">
              {isEditingText ? (
                <div>
                  <Textarea
                    autoFocus
                    value={textEditDraft}
                    onChange={(e) => setTextEditDraft(e.target.value)}
                    className="min-h-[120px] w-full resize-none border-none bg-transparent! p-0! text-sm text-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingText(false)}
                      disabled={isSavingTextEdit}
                      className="rounded-lg px-4"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingTextEdit || !textEditDraft.trim() || textEditDraft.trim() === part.text.trim()}
                      onClick={async () => {
                        try {
                          setIsSavingTextEdit(true);
                          const updatedParts = parts.map((p, i) =>
                            i === partIndex ? ({ ...p, text: textEditDraft } as ChatMessage['parts'][number]) : p,
                          );
                          await persistMessageParts(updatedParts);
                          setIsEditingText(false);
                        } catch (error) {
                          console.error('Error saving edited summary:', error);
                          sileo.error({ title: 'Failed to save summary edit' });
                        } finally {
                          setIsSavingTextEdit(false);
                        }
                      }}
                      className="rounded-lg px-5 bg-primary hover:bg-primary/90"
                    >
                      {isSavingTextEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{part.text}</p>
              )}
            </CardContent>
          )}
        </Card>
      );
    }

    // Handle text parts
    if (part.type === 'text') {
      // Check if there are any reasoning parts in the message
      const hasReasoningParts = parts.some((p) => p.type === 'reasoning');

      // For empty text parts in a streaming message, show loading animation only if no tool invocations and no reasoning parts are present
      if (
        (!part.text || part.text.trim() === '') &&
        (status === 'streaming' || status === 'submitted') &&
        !hasActiveToolInvocations &&
        !hasReasoningParts
      ) {
        return (
          <div
            key={`${messageIndex}-${partIndex}-loading`}
            className="flex flex-col min-h-[calc(100vh-18rem)] m-0! p-0! mt-4!"
          >
            <StreamingIndicator />
          </div>
        );
      }

      // Skip empty text parts entirely for non-streaming states, but allow them during streaming with active tool invocations
      if (!part.text || part.text.trim() === '') {
        // Only skip if we're not streaming or if there are no active tool invocations
        if (status !== 'streaming' || !hasActiveToolInvocations) {
          return null;
        }
        // If we're streaming with active tool invocations, don't render anything for empty text but don't block other parts
        return <div key={`${messageIndex}-${partIndex}-empty`}></div>;
      }

      const prevPart = parts[partIndex - 1];

      if (
        part.type === 'text' &&
        isWithinXaiToolRun &&
        (!part.text || part.text.trim() === '' || part.text.trim() === '<|im_end|>')
      ) {
        return null;
      }

      // Skip text parts that are ONLY <|im_end|> after a tool call/source
      const hasToolInvocationBefore = parts
        .slice(0, partIndex)
        .some((p) => isToolPartType(p.type) || isSourcePartType(p.type));
      if (hasToolInvocationBefore && part.text.trim() === '<|im_end|>') {
        return null;
      }

      // Determine if this is the last assistant message
      const isLastAssistantMessage = messageIndex === messages.length - 1 && message.role === 'assistant';
      // A multi-step tool loop (reasoning -> tool call -> reasoning -> answer)
      // can legitimately produce several `text` parts within one assistant
      // message — one per step. Action buttons belong on the message as a
      // whole, not on every individual step, so only the last text part is
      // eligible.
      const lastTextIndex = parts.reduce((acc, p, idx) => (p.type === 'text' ? idx : acc), -1);
      const isLastTextPart = partIndex === lastTextIndex;
      // Show action buttons when:
      // 1. This is the last text part of the message, AND
      // 2. Status is ready or error (no streaming happening), OR this is NOT
      //    the last assistant message (previous messages keep their buttons)
      // 'error' is included so a response interrupted by a stream failure (not a clean
      // manual stop) still lets the user delete/retry instead of getting stuck on Edit-only.
      const shouldShowActionButtons =
        isLastTextPart && (status === 'ready' || status === 'error' || !isLastAssistantMessage);

      // Clean the text by removing box markers and special tokens
      const cleanText = part.text
        .replace(/<\|begin_of_box\|>/g, '')
        .replace(/<\|end_of_box\|>/g, '')
        .replace(/<\|im_end\|>/g, '');

      // No backdrop-blur — up to 8 of these mount per assistant message, and each one
      // forces a fresh re-composite of whatever scrolls behind it every frame. A flat,
      // slightly more opaque background (bumped from /40 to compensate for losing the
      // blur that used to soften it) reads the same without the scroll-jank cost.
      const actionIconButtonClassName =
        'h-8 w-8 rounded-sm border border-border bg-background/60 text-muted-foreground shadow-none transition-colors hover:bg-accent/60 hover:text-foreground';

      // Check if the message has canvas spec data parts — only render after the LAST text part
      const hasCanvasSpec = isLastTextPart && parts.some((p) => p.type === SPEC_DATA_PART_TYPE);

      // Images already shown by a generate_image/edit_image tool card in this
      // message — if the model echoes the same URL in its text (despite being
      // told not to), swap it for a download chip instead of duplicating it.
      const generatedImageUrls = new Set(
        parts
          .filter((p) => p.type === 'tool-generate_image' || p.type === 'tool-edit_image')
          .map((p) => {
            const anyPart = p as { state?: string; output?: { success?: boolean; imageUrl?: string } };
            return anyPart.state === 'output-available' && anyPart.output?.success
              ? anyPart.output.imageUrl
              : undefined;
          })
          .filter((url): url is string => Boolean(url)),
      );

      const canEditResponse = (user && isOwner) || (!user && selectedVisibilityType === 'private');

      return (
        <div key={`${messageIndex}-${partIndex}-text`} className="mt-2">
          {isEditingText ? (
            <div className="w-full rounded-2xl border border-border bg-accent/80 px-4 py-3">
              <Textarea
                autoFocus
                value={textEditDraft}
                onChange={(e) => setTextEditDraft(e.target.value)}
                className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert font-sans font-normal max-w-none
                  text-base! text-foreground dark:text-foreground w-full resize-none border-none shadow-none
                  focus-visible:ring-0 focus-visible:ring-offset-0 p-0! outline-none min-h-[120px] bg-transparent!"
              />
              <div className="flex items-center justify-end gap-2 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingText(false)}
                  disabled={isSavingTextEdit}
                  className="rounded-lg px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSavingTextEdit || !textEditDraft.trim() || textEditDraft.trim() === cleanText.trim()}
                  onClick={async () => {
                    try {
                      setIsSavingTextEdit(true);
                      const updatedParts = parts.map((p, i) =>
                        i === partIndex ? ({ ...p, text: textEditDraft } as ChatMessage['parts'][number]) : p,
                      );
                      await persistMessageParts(updatedParts);
                      setIsEditingText(false);
                    } catch (error) {
                      console.error('Error saving edited response:', error);
                      sileo.error({ title: 'Failed to save edit' });
                    } finally {
                      setIsSavingTextEdit(false);
                    }
                  }}
                  className="rounded-lg px-5 bg-primary hover:bg-primary/90"
                >
                  {isSavingTextEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <ChatTextHighlighter onHighlight={onHighlight} removeHighlightOnClick={true}>
                <MarkdownRenderer content={cleanText} generatedImageUrls={generatedImageUrls} />
              </ChatTextHighlighter>
            </div>
          )}

          {/* Canvas spec rendering (between text and action buttons) */}
          {!isEditingText && hasCanvasSpec && <CanvasSpecRenderer parts={parts} isStreaming={status === 'streaming'} />}

          {/* Action buttons below the text — none of them are meaningful for a Hermes
              message: Edit/Rewrite would silently do nothing (blocked, see the guard at
              the top of this component), Branch Out would produce a chat with no real
              hermesConversation link (a dead end masquerading as a continuation), and
              Copy/TTS/Download exist for a native LLM turn's deliverable output, not a
              relayed status update. Hidden wholesale rather than picked apart per-icon. */}
          {shouldShowActionButtons && !isEditingText && !isHermesChat && (
            <div className="flex items-center justify-between mt-3 mb-4">
              {/* Left side - Action buttons */}
              <div className="flex items-center gap-1.5">
                {/* Edit button - overwrites this response's text in place, no regenerate. Available on any assistant message, not just the last. */}
                {canEditResponse && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setTextEditDraft(cleanText);
                            setIsEditingText(true);
                          }}
                          className={actionIconButtonClassName}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        Edit response
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Rewrite button - only for owners or unauthenticated users on private chats, and only on last assistant message */}
                {((user && isOwner) || (!user && selectedVisibilityType === 'private')) && isLastAssistantMessage && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isRegenerating}
                          onClick={async () => {
                            if (isRegenerating) return;
                            if (isHermesChat) {
                              sileo.error({
                                title: 'Retry is not available here',
                                description: 'Use the /retry command in your Agent chat instead.',
                              });
                              return;
                            }

                            try {
                              setIsRegenerating(true);
                              const lastUserMessage = messages.findLast((m) => m.role === 'user');
                              if (!lastUserMessage) return;

                              // Step 1: Stop any in-flight stream first to prevent the old response's
                              // onFinish from saving stale messages to DB after we delete them
                              await stop();

                              // Step 2: Small delay to allow the abort to propagate and any in-flight
                              // server-side onFinish to complete before we delete
                              await new Promise((resolve) => setTimeout(resolve, 100));

                              // Step 3: Delete trailing messages from DB
                              if (user && lastUserMessage.id) {
                                await deleteTrailingMessages({
                                  id: lastUserMessage.id,
                                });
                              }

                              // Step 4: Update local state to remove assistant messages
                              const newMessages = [];
                              for (let i = 0; i < messages.length; i++) {
                                newMessages.push(messages[i]);
                                if (messages[i].id === lastUserMessage.id) {
                                  break;
                                }
                              }

                              setMessages(newMessages);
                              setSuggestedQuestions([]);

                              // Step 5: Regenerate
                              await regenerate();
                            } catch (error) {
                              console.error('Error in reload:', error);
                            } finally {
                              setIsRegenerating(false);
                            }
                          }}
                          className={actionIconButtonClassName}
                        >
                          <TryAgainIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        Try Again
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Delete button - removes this response along with the user message that prompted it.
                    Only for owners or unauthenticated users on private chats, and only on last assistant message */}
                {((user && isOwner) || (!user && selectedVisibilityType === 'private')) && isLastAssistantMessage && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isDeletingMessage}
                          onClick={async () => {
                            if (isDeletingMessage) return;

                            try {
                              setIsDeletingMessage(true);

                              const lastUserMessage = messages.findLast((m) => m.role === 'user');
                              if (!lastUserMessage) return;

                              // Step 1: Stop any in-flight stream first to prevent the old response's
                              // onFinish from saving stale messages to DB after we delete them
                              await stop();

                              // Step 2: Small delay to allow the abort to propagate and any in-flight
                              // server-side onFinish to complete before we delete
                              await new Promise((resolve) => setTimeout(resolve, 100));

                              // Step 3: Delete the user message and everything after it (this response) from the DB
                              if (user && lastUserMessage.id) {
                                await deleteTrailingMessages({ id: lastUserMessage.id });
                              }

                              // Step 4: Update local state to remove the user message and this response
                              const lastUserMessageIndex = messages.findIndex((m) => m.id === lastUserMessage.id);
                              setMessages(messages.slice(0, lastUserMessageIndex));
                              setSuggestedQuestions([]);
                            } catch (error) {
                              console.error('Error deleting message:', error);
                              sileo.error({ title: 'Failed to delete message' });
                            } finally {
                              setIsDeletingMessage(false);
                            }
                          }}
                          className={actionIconButtonClassName}
                        >
                          {isDeletingMessage ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        Delete question & response
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Share button */}
                {onVisibilityChange && (
                  <ShareButton
                    chatId={chatId || null}
                    selectedVisibilityType={selectedVisibilityType || 'private'}
                    onVisibilityChange={async (visibility) => {
                      await Promise.resolve(onVisibilityChange(visibility));
                    }}
                    isOwner={isOwner}
                    user={user}
                    variant="icon"
                    size="sm"
                    className={actionIconButtonClassName}
                  />
                )}

                {/* Copy button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(cleanText);
                          sileo.success({
                            title: 'Copied to clipboard',
                            description: 'You can now paste it anywhere',
                            icon: <Copy className="h-4 w-4" />,
                          });
                        }}
                        className={actionIconButtonClassName}
                      >
                        <CopyIcon className="h-[18px] w-[18px]" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={4}>
                      Copy
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Read Aloud button - hits /api/tts/stream, which requires an
                    authenticated session (lib/voice-session-token.ts); unlike
                    Copy, an anonymous visitor's click would just 401 silently */}
                {user && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (isSpeaking || isLoading) {
                              stopSpeech();
                            } else {
                              const speakable = extractSpeakableText(cleanText);
                              if (speakable) speak(speakable);
                            }
                          }}
                          className={cn(
                            actionIconButtonClassName,
                            (isSpeaking || isLoading) &&
                              'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15',
                          )}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isSpeaking ? (
                            <Square className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        {isLoading ? 'Connecting…' : isSpeaking ? 'Stop' : 'Read Aloud'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Branch Out button - only for owners or unauthenticated users on private chats, and only on assistant messages */}
                {((user && isOwner) || (!user && selectedVisibilityType === 'private')) &&
                  message.role === 'assistant' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isBranchingOut}
                            onClick={async () => {
                              if (isBranchingOut) return;

                              try {
                                setIsBranchingOut(true);

                                // Find the corresponding user message (the one before this assistant message)
                                const currentMessageIndex = messages.findIndex((m) => m.id === message.id);
                                if (currentMessageIndex === -1) {
                                  sileo.error({ title: 'Could not find message' });
                                  return;
                                }

                                // Find the last user message before this assistant message
                                let userMessage: ChatMessage | undefined;
                                for (let i = currentMessageIndex - 1; i >= 0; i--) {
                                  if (messages[i].role === 'user') {
                                    userMessage = messages[i];
                                    break;
                                  }
                                }

                                if (!userMessage) {
                                  sileo.error({ title: 'Could not find corresponding user message' });
                                  return;
                                }

                                // Branch out the chat
                                const result = await branchOutChat({
                                  userMessage: userMessage as any,
                                  assistantMessage: message as any,
                                });

                                if (result.success && result.chatId) {
                                  // Invalidate recent chats cache to show the new chat in sidebar
                                  if (user?.id) {
                                    queryClient.refetchQueries({ queryKey: ['recent-chats', user.id] });
                                  }
                                  sileo.success({ title: 'Chat branched out successfully' });
                                  await new Promise((resolve) => setTimeout(resolve, 100));
                                  // Navigate to the new chat
                                  router.push(`/search/${result.chatId}`);
                                } else {
                                  sileo.error({ title: result.error || 'Failed to branch out chat' });
                                }
                              } catch (error) {
                                console.error('Error branching out chat:', error);
                                sileo.error({ title: 'Failed to branch out chat' });
                              } finally {
                                setIsBranchingOut(false);
                              }
                            }}
                            className={actionIconButtonClassName}
                          >
                            {isBranchingOut ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <HugeiconsIcon icon={SplitIcon} size={16} color="currentColor" className="rotate-90" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={4}>
                          Branch Out
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                {/* Export dropdown */}
                {message.role === 'assistant' && (
                  <DropdownMenu>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className={actionIconButtonClassName}>
                              <IconArrowInbox className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={4}>
                          Export
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenuContent className="min-w-[140px]" align="start" sideOffset={4}>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={async () => {
                          try {
                            const textParts = (message.parts || [])
                              .filter((p) => p.type === 'text' && (p as any).text)
                              .map((p: any) => String(p.text).trim())
                              .filter((s: string) => s.length > 0);
                            const content = textParts.join('\n\n');
                            if (!content) {
                              sileo.error({
                                title: 'Nothing to export',
                                description: 'No content found in this message',
                                icon: <AlertCircle className="h-4 w-4" />,
                              });
                              return;
                            }

                            const payload = {
                              title: 'Zetora AI',
                              content,
                              meta: {
                                modelLabel: modelLabel || null,
                                createdAt: (message as any)?.createdAt || Date.now(),
                              },
                            };

                            const res = await fetch('/api/export/pdf', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload),
                            });
                            if (!res.ok) {
                              const errText = await res.text();
                              throw new Error(errText || 'Failed to generate PDF');
                            }
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `zetora-export-${message.id || Date.now()}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                            sileo.success({
                              title: 'PDF downloaded',
                              description: 'Your PDF file is ready',
                              icon: <FilePdf className="h-4 w-4" />,
                            });
                          } catch (e) {
                            console.error('Export PDF error:', e);
                            sileo.error({
                              title: 'Failed to export PDF',
                              description: 'Please try again',
                              icon: <X className="h-4 w-4" />,
                            });
                          }
                        }}
                      >
                        <FilePdf className="h-4 w-4" />
                        <span>PDF</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={async () => {
                          try {
                            const textParts = (message.parts || [])
                              .filter((p) => p.type === 'text' && (p as any).text)
                              .map((p: any) => String(p.text).trim())
                              .filter((s: string) => s.length > 0);
                            const content = textParts.join('\n\n');
                            if (!content) {
                              sileo.error({
                                title: 'Nothing to export',
                                description: 'No content found in this message',
                                icon: <AlertCircle className="h-4 w-4" />,
                              });
                              return;
                            }

                            const payload = {
                              title: 'Zetora AI',
                              content,
                              meta: {
                                modelLabel: modelLabel || null,
                                createdAt: (message as any)?.createdAt || Date.now(),
                              },
                            };

                            const res = await fetch('/api/export/docx', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload),
                            });
                            if (!res.ok) {
                              const errText = await res.text();
                              throw new Error(errText || 'Failed to generate Word document');
                            }
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `zetora-export-${message.id || Date.now()}.docx`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                            sileo.success({
                              title: 'Word document downloaded',
                              description: 'Your Word file is ready',
                              icon: <FileDoc className="h-4 w-4" />,
                            });
                          } catch (e) {
                            console.error('Export Word error:', e);
                            sileo.error({
                              title: 'Failed to export Word document',
                              description: 'Please try again',
                              icon: <X className="h-4 w-4" />,
                            });
                          }
                        }}
                      >
                        <FileDoc className="h-4 w-4" />
                        <span>Word</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={() => {
                          try {
                            const textParts = (message.parts || [])
                              .filter((p) => p.type === 'text' && (p as any).text)
                              .map((p: any) => String(p.text).trim())
                              .filter((s: string) => s.length > 0);
                            const content = textParts.join('\n\n');
                            if (!content) {
                              sileo.error({
                                title: 'Nothing to export',
                                description: 'No content found in this message',
                                icon: <AlertCircle className="h-4 w-4" />,
                              });
                              return;
                            }

                            const links: { text: string; url: string }[] = [];
                            const seen = new Set<string>();

                            const inlineLinkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
                            let m: RegExpExecArray | null;
                            while ((m = inlineLinkRegex.exec(content)) !== null) {
                              const text = m[1];
                              const url = m[2].replace(/[.,;:]+$/, '');
                              if (!seen.has(url)) {
                                seen.add(url);
                                links.push({ text, url });
                              }
                            }

                            const bareUrlRegex = /(?:^|\s)(https?:\/\/[^\s)]+)(?=$|\s)/g;
                            while ((m = bareUrlRegex.exec(content)) !== null) {
                              const url = m[1].replace(/[.,;:]+$/, '');
                              if (!seen.has(url)) {
                                seen.add(url);
                                links.push({ text: url, url });
                              }
                            }

                            const references =
                              links.length > 0
                                ? '\n\n## References\n\n' + links.map((l) => `- [${l.text}](${l.url})`).join('\n')
                                : '';

                            const finalMd = content + references;

                            const blob = new Blob([finalMd], { type: 'text/markdown;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `zetora-export-${message.id || Date.now()}.md`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                            sileo.success({
                              title: 'Markdown downloaded',
                              description: 'Your Markdown file is ready',
                              icon: <FileMd className="h-4 w-4" />,
                            });
                          } catch (e) {
                            console.error('Export Markdown error:', e);
                            sileo.error({
                              title: 'Failed to export Markdown',
                              description: 'Please try again',
                              icon: <X className="h-4 w-4" />,
                            });
                          }
                        }}
                      >
                        <FileMd className="h-4 w-4" />
                        <span>Markdown</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Right side - Message metadata */}
              <div className="flex items-center gap-1.5">
                {sourceItems.length > 0 &&
                  (isMobile ? (
                    <Drawer>
                      <DrawerTrigger asChild>
                        <Button variant="ghost" className={cn(sourceDialogTriggerClassName, 'w-auto gap-1.5')}>
                          <Globe className="h-3.5 w-3.5" />
                          <span>Sources</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{sourceItems.length}</span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent className="max-h-[85vh]">
                        <DrawerHeader>
                          <DrawerTitle className="flex items-center gap-2 text-base">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            Sources
                          </DrawerTitle>
                          <p className="text-sm text-muted-foreground text-pretty">
                            References used to generate this response.
                          </p>
                        </DrawerHeader>
                        <div className={cn(sourcePanelBodyClassName, 'px-4')}>
                          <div className={sourcePanelListClassName}>
                            {sourceItems.map((source, index) => renderSourceEntry(source, index))}
                          </div>
                        </div>
                      </DrawerContent>
                    </Drawer>
                  ) : (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" className={cn(sourceDialogTriggerClassName, 'w-auto gap-1.5')}>
                          <Globe className="h-3.5 w-3.5" />
                          <span>Sources</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{sourceItems.length}</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2 text-base">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            Sources
                          </DialogTitle>
                          <p className="text-sm text-muted-foreground text-pretty">
                            References used to generate this response.
                          </p>
                        </DialogHeader>
                        <div className={cn(sourcePanelBodyClassName, 'max-h-[60vh] pr-1')}>
                          <div className={sourcePanelListClassName}>
                            {sourceItems.map((source, index) => renderSourceEntry(source, index))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}

                {hasResponseInfo && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(actionIconButtonClassName, 'touch-manipulation lg:pointer-events-auto')}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 max-w-[calc(100vw-2rem)]"
                      side="top"
                      align="end"
                      sideOffset={8}
                      alignOffset={-8}
                      avoidCollisions={true}
                      collisionPadding={16}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          <h4 className="font-semibold text-sm">Response Info</h4>
                        </div>

                        {hermesGatewayId && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Agent</span>
                              <div className="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-lg px-2 py-1">
                                <HugeiconsIcon icon={Robot01Icon} size={12} />
                                Hermes Agent
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-muted-foreground">Gateway</span>
                              <span className="text-xs font-mono truncate">{hermesGatewayId}</span>
                            </div>
                            {hermesReceivedAt && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Received</span>
                                <span className="text-xs">{hermesReceivedAt}</span>
                              </div>
                            )}
                          </>
                        )}

                        {modelLabel && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Model</span>
                            <div className="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-lg px-2 py-1">
                              <HugeiconsIcon icon={CpuIcon} size={12} />
                              {modelLabel}
                            </div>
                          </div>
                        )}

                        {completionTime !== null && (
                          <div className="flex items-center justify-between">
                            {/* For a Hermes reply this is wall-clock time from the user's message
                                to the reply's arrival (agent-event/route.ts), not model time. */}
                            <span className="text-sm text-muted-foreground">
                              {hermesGatewayId ? 'Response Time' : 'Generation Time'}
                            </span>
                            <div className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3" />
                              {completionTime.toFixed(1)}s
                            </div>
                          </div>
                        )}

                        {(inputCount != null || outputCount != null) && (
                          <div className="space-y-2">
                            <span className="text-sm text-muted-foreground">Token Usage</span>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {inputCount != null && (
                                <div className="flex items-center justify-between bg-muted rounded-lg px-2 py-1">
                                  <span className="flex items-center gap-1">
                                    <ArrowLeftIcon weight="regular" className="h-3 w-3" />
                                    Input
                                  </span>
                                  <span className="font-medium">{inputCount.toLocaleString()}</span>
                                </div>
                              )}
                              {outputCount != null && (
                                <div className="flex items-center justify-between bg-muted rounded-lg px-2 py-1">
                                  <span className="flex items-center gap-1">
                                    <ArrowRightIcon weight="regular" className="h-3 w-3" />
                                    Output
                                  </span>
                                  <span className="font-medium">{outputCount.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                            {tokenTotal != null && (
                              <div className="flex items-center justify-between bg-accent rounded-lg px-2 py-1 text-xs">
                                <span className="flex items-center gap-1 font-medium">
                                  <SigmaIcon className="h-3 w-3" weight="regular" />
                                  Total
                                </span>
                                <span className="font-semibold">{tokenTotal.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Handle reasoning parts
    if (part.type === 'reasoning') {
      const mcpDynamicToolIndices = parts
        .map((messagePart, index) =>
          messagePart.type === 'dynamic-tool' && (messagePart as any).toolName?.startsWith('mcp_') ? index : -1,
        )
        .filter((index) => index >= 0);

      if (mcpDynamicToolIndices.length > 0) {
        const firstMcpToolIndex = mcpDynamicToolIndices[0]!;
        const lastMcpToolIndex = mcpDynamicToolIndices[mcpDynamicToolIndices.length - 1]!;

        let mcpTimelineStartIndex = firstMcpToolIndex;
        for (let i = firstMcpToolIndex - 1; i >= 0; i--) {
          const p = parts[i];
          if (!p) break;
          if (p.type === 'reasoning' || p.type === 'step-start' || p.type === 'text') {
            mcpTimelineStartIndex = i;
          } else {
            break;
          }
        }

        const finalTextIndex = parts.findIndex(
          (messagePart, index) =>
            index > lastMcpToolIndex &&
            messagePart.type === 'text' &&
            typeof (messagePart as any).text === 'string' &&
            (messagePart as any).text.trim().length > 50,
        );
        const mcpTimelineEndIndex = finalTextIndex === -1 ? parts.length - 1 : finalTextIndex - 1;

        if (partIndex >= mcpTimelineStartIndex && partIndex <= mcpTimelineEndIndex) {
          return null;
        }
      }

      const prevPart = parts[partIndex - 1];
      if (prevPart && prevPart.type === 'reasoning') {
        return null;
      }

      // Merge consecutive reasoning parts into a single block
      let nextIndex = partIndex;
      const mergedTexts: string[] = [];
      const reasoningStates: Array<ReasoningUIPart['state']> = [];
      while (nextIndex < parts.length && parts[nextIndex]?.type === 'reasoning') {
        const r = parts[nextIndex] as unknown as ReasoningUIPart;
        if (typeof r.text === 'string' && r.text.length > 0) {
          mergedTexts.push(r.text);
        }
        if (r.state) {
          reasoningStates.push(r.state);
        }
        nextIndex += 1;
      }

      const mergedState: ReasoningUIPart['state'] = reasoningStates.includes('streaming')
        ? 'streaming'
        : reasoningStates.includes('done')
          ? 'done'
          : undefined;

      // Detect whether this provider streams token-by-token or in whole chunks.
      // BPE tokens are virtually never longer than ~15 chars; if any part exceeds
      // 30 chars it must be a chunk-based model (GPT, Gemini) whose chunks don't
      // carry trailing newlines and therefore need an explicit paragraph separator.
      // Token-by-token models (Minimax) already embed all whitespace in the token
      // stream, so plain concatenation preserves their structure.
      const isChunkBased = mergedTexts.some((t) => t.length > 30);
      const mergedText = mergedTexts.join(isChunkBased ? '\n\n' : '');

      const mergedPart: ReasoningUIPart = {
        ...(part as ReasoningUIPart),
        text: mergedText,
        state: mergedState,
      };

      const sectionKey = `${messageIndex}-${partIndex}`;
      // 1-indexed position of this block among all reasoning blocks in the turn
      // (consecutive raw reasoning parts merge into one block, see above).
      const reasoningIndex = parts
        .slice(0, partIndex + 1)
        .filter(
          (p: ChatMessage['parts'][number], i: number, arr: ChatMessage['parts']) =>
            p.type === 'reasoning' && arr[i - 1]?.type !== 'reasoning',
        ).length;
      const hasParallelToolInvocation = parts.some((p: ChatMessage['parts'][number]) => isToolPartType(p.type));
      const hasFollowingOutput = parts.some(
        (p: ChatMessage['parts'][number], i: number) => i > partIndex && (p.type === 'text' || isToolPartType(p.type)),
      );
      const parallelTool = hasParallelToolInvocation
        ? (() => {
            const firstToolPart = parts.find((p: ChatMessage['parts'][number]) => isToolPartType(p.type)) as any;
            if (!firstToolPart) return null;
            if (firstToolPart.type === 'dynamic-tool')
              return formatDynamicToolName('dynamic-tool', firstToolPart.toolName);
            return firstToolPart.type.split('-')[1] ?? null;
          })()
        : null;

      // "Done reasoning" is controlled by the reasoning part state (if present),
      // otherwise we fall back to "did we already see output after reasoning".
      const isCompleteForView = mergedState === 'done' || (mergedState == null && hasFollowingOutput);

      // Default UX:
      // - while streaming: expanded (so user can see it updating)
      // - once complete: collapsed (so it "closes" automatically)
      // If the user manually toggles it, that preference wins.
      const expandedOverride = reasoningVisibilityMap[sectionKey];
      const isFullscreen = reasoningFullscreenMap[sectionKey] ?? false;

      const setIsExpanded = (v: boolean) => setReasoningVisibilityMap((prev) => ({ ...prev, [sectionKey]: v }));
      const setIsFullscreen = (v: boolean) => setReasoningFullscreenMap((prev) => ({ ...prev, [sectionKey]: v }));

      // Edit-in-place: overwrites this reasoning block's stored text, no
      // regenerate. Disabled while it's still streaming — nothing settled to edit yet.
      const canEditReasoning =
        ((user && isOwner) || (!user && selectedVisibilityType === 'private')) && mergedState !== 'streaming';
      const editRangeStart = partIndex;
      const editRangeEnd = nextIndex;

      return (
        <ReasoningPartView
          key={sectionKey}
          part={mergedPart}
          sectionKey={sectionKey}
          reasoningIndex={reasoningIndex}
          parallelTool={parallelTool}
          isComplete={isCompleteForView}
          expandedOverride={expandedOverride}
          isFullscreen={isFullscreen}
          setIsExpanded={setIsExpanded}
          setIsFullscreen={setIsFullscreen}
          canEdit={canEditReasoning}
          isEditing={isEditingReasoning}
          isSaving={isSavingReasoningEdit}
          editDraft={reasoningEditDraft}
          onEditDraftChange={setReasoningEditDraft}
          onStartEdit={() => {
            setReasoningEditDraft(mergedText);
            setIsEditingReasoning(true);
            setIsExpanded(true);
          }}
          onCancelEdit={() => setIsEditingReasoning(false)}
          onSaveEdit={async () => {
            try {
              setIsSavingReasoningEdit(true);
              const updatedPart = {
                ...(part as ReasoningUIPart),
                text: reasoningEditDraft,
                state: 'done',
              } as ChatMessage['parts'][number];
              const updatedParts = [...parts.slice(0, editRangeStart), updatedPart, ...parts.slice(editRangeEnd)];
              await persistMessageParts(updatedParts);
              setIsEditingReasoning(false);
            } catch (error) {
              console.error('Error saving edited reasoning:', error);
              sileo.error({ title: 'Failed to save edit' });
            } finally {
              setIsSavingReasoningEdit(false);
            }
          }}
        />
      );
    }

    // Handle step-start parts
    if (part.type === 'step-start') {
      const firstStepStartIndex = parts.findIndex((p) => p.type === 'step-start');
      if (partIndex === firstStepStartIndex) {
        return <div key={`${messageIndex}-${partIndex}-step-start-logo`} className="p-0 py-1.5" />;
      }
      return <div key={`${messageIndex}-${partIndex}-step-start`}></div>;
    }

    // Skip canvas spec data parts (rendered inline after text via CanvasSpecRenderer)
    if (part.type === SPEC_DATA_PART_TYPE) {
      return null;
    }

    if (part.type === 'source-url') {
      return null;
    }

    if (part.type === 'data-hermes_prompt') {
      if (!chatId) return null;
      return (
        <HermesPromptCard
          key={`${messageIndex}-${partIndex}-hermes-prompt`}
          chatId={chatId}
          prompt={(part as { data: HermesPromptData }).data}
        />
      );
    }

    if (part.type === 'data-hermes_media') {
      return (
        <HermesMediaCard
          key={`${messageIndex}-${partIndex}-hermes-media`}
          media={(part as { data: HermesMediaData }).data}
        />
      );
    }

    if (part.type === 'dynamic-tool') {
      const mcpDynamicToolIndices = parts
        .map((messagePart, index) =>
          messagePart.type === 'dynamic-tool' && (messagePart as any).toolName?.startsWith('mcp_') ? index : -1,
        )
        .filter((index) => index >= 0);

      if (mcpDynamicToolIndices.length > 0) {
        const firstMcpToolIndex = mcpDynamicToolIndices[0]!;
        const lastMcpToolIndex = mcpDynamicToolIndices[mcpDynamicToolIndices.length - 1]!;

        let mcpTimelineStartIndex = firstMcpToolIndex;
        for (let i = firstMcpToolIndex - 1; i >= 0; i--) {
          const p = parts[i];
          if (!p) break;
          if (p.type === 'reasoning' || p.type === 'step-start' || p.type === 'text') {
            mcpTimelineStartIndex = i;
          } else {
            break;
          }
        }

        const finalTextIndex = parts.findIndex(
          (messagePart, index) =>
            index > lastMcpToolIndex &&
            messagePart.type === 'text' &&
            typeof (messagePart as any).text === 'string' &&
            (messagePart as any).text.trim().length > 50,
        );
        const mcpTimelineEndIndex = finalTextIndex === -1 ? parts.length - 1 : finalTextIndex - 1;
        const currentPartIsMcpTool = (part as any).toolName?.startsWith('mcp_');

        if (!currentPartIsMcpTool) {
          return <DynamicToolInvocationCard part={part} />;
        }

        if (partIndex !== firstMcpToolIndex) {
          return null;
        }

        const entries: McpTimelineEntry[] = [];
        let cursor = mcpTimelineStartIndex;

        while (cursor <= mcpTimelineEndIndex) {
          const currentPart = parts[cursor] as any;

          if (currentPart?.type === 'dynamic-tool' && currentPart?.toolName?.startsWith('mcp_')) {
            entries.push({
              kind: 'tool',
              part: currentPart,
              originalIndex: cursor,
              id: currentPart.toolCallId || `mcp-tool-${messageIndex}-${cursor}`,
            });
            cursor += 1;
            continue;
          }

          if (currentPart?.type === 'reasoning') {
            const reasoningTexts: string[] = [];
            const reasoningStates: Array<ReasoningUIPart['state']> = [];
            const reasoningStartIndex = cursor;

            while (cursor <= mcpTimelineEndIndex && parts[cursor]?.type === 'reasoning') {
              const reasoningPart = parts[cursor] as unknown as ReasoningUIPart;
              if (typeof reasoningPart.text === 'string' && reasoningPart.text.length > 0) {
                reasoningTexts.push(reasoningPart.text);
              }
              if (reasoningPart.state) {
                reasoningStates.push(reasoningPart.state);
              }
              cursor += 1;
            }

            if (reasoningTexts.length > 0) {
              const isChunkBased = reasoningTexts.some((text) => text.length > 30);
              const mergedText = reasoningTexts.join(isChunkBased ? '\n\n' : '');
              const mergedState: ReasoningUIPart['state'] = reasoningStates.includes('streaming')
                ? 'streaming'
                : reasoningStates.includes('done')
                  ? 'done'
                  : undefined;

              entries.push({
                kind: 'reasoning',
                text: mergedText,
                state: mergedState,
                id: `mcp-reasoning-${messageIndex}-${reasoningStartIndex}`,
              });
            }
            continue;
          }

          if (currentPart?.type === 'text') {
            const textStartIndex = cursor;
            const textChunks: string[] = [];

            while (cursor <= mcpTimelineEndIndex && parts[cursor]?.type === 'text') {
              const textPart = parts[cursor] as { text?: string };
              if (typeof textPart.text === 'string' && textPart.text.length > 0) {
                const cleaned = textPart.text
                  .replace(/<\|begin_of_box\|>/g, '')
                  .replace(/<\|end_of_box\|>/g, '')
                  .replace(/<\|im_end\|>/g, '')
                  .trim();
                if (cleaned.length > 0) {
                  textChunks.push(cleaned);
                }
              }
              cursor += 1;
            }

            const isBetweenTools = textStartIndex > firstMcpToolIndex && textStartIndex < lastMcpToolIndex;

            if (isBetweenTools && textChunks.length > 0) {
              entries.push({
                kind: 'text',
                text: textChunks.join('\n\n'),
                id: `mcp-text-${messageIndex}-${textStartIndex}`,
              });
            }
            continue;
          }

          cursor += 1;
        }

        const resolveInlineElicitation = (elicitationId: string) => {
          ignoredInlineElicitationIdsRef.current.add(elicitationId);
          setInlineElicitationVersion((v) => v + 1);
        };

        if (entries.length > 1 || inlineElicitations.length > 0) {
          return (
            <DynamicToolStepper
              entries={entries}
              messageIndex={messageIndex}
              startIndex={partIndex}
              sendMessage={sendMessage}
              inlineElicitations={inlineElicitations}
              onInlineElicitationResolved={resolveInlineElicitation}
            />
          );
        }

        const onlyEntry = entries[0];
        if (onlyEntry?.kind === 'tool') {
          return <DynamicToolInvocationCard part={onlyEntry.part} sendMessage={sendMessage} />;
        }

        if (onlyEntry?.kind === 'reasoning') {
          return (
            <div className="rounded-xl border border-border/60 overflow-hidden bg-card/30 mt-1">
              <div className="px-3.5 py-2.5 text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                <MarkdownRenderer content={onlyEntry.text} />
              </div>
            </div>
          );
        }

        if (onlyEntry?.kind === 'text') {
          return (
            <div className="rounded-xl border border-border/60 overflow-hidden bg-card/30 mt-1">
              <div className="px-3.5 py-2.5 text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap wrap-break-word">
                <MarkdownRenderer content={onlyEntry.text} />
              </div>
            </div>
          );
        }
      }

      const isUngroupedDynamicTool = (messagePart: unknown) =>
        (messagePart as { type?: string }).type === 'dynamic-tool';

      const firstDynamicToolIndex = parts.findIndex(isUngroupedDynamicTool);
      if (partIndex !== firstDynamicToolIndex) {
        return null;
      }

      const dynamicSequenceEntries = parts
        .map((messagePart, index) =>
          isUngroupedDynamicTool(messagePart)
            ? {
                kind: 'tool' as const,
                part: messagePart,
                originalIndex: index,
                id: (messagePart as any).toolCallId || `dynamic-tool-${messageIndex}-${index}`,
              }
            : null,
        )
        .filter((entry): entry is { kind: 'tool'; part: any; originalIndex: number; id: string } => Boolean(entry));

      if (dynamicSequenceEntries.length > 1) {
        return (
          <DynamicToolStepper
            entries={dynamicSequenceEntries}
            messageIndex={messageIndex}
            startIndex={partIndex}
            sendMessage={sendMessage}
          />
        );
      }

      return <DynamicToolInvocationCard part={part} sendMessage={sendMessage} />;
    }

    // Handle tool parts with new granular states system
    if (isStaticToolUIPart(part)) {
      // Check if this part has the new state system
      if ('state' in part && part.state) {
        switch (part.type) {
          case 'tool-find_place_on_map':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={MapPin}
                    text="Finding locations..."
                    color="blue"
                  />
                );
              case 'output-available':
                // Handle error responses
                if (!part.output.success) {
                  return (
                    <div
                      key={`${messageIndex}-${partIndex}-tool`}
                      className="w-full my-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950"
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900 flex items-center justify-center">
                            <MapPin className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-red-900 dark:text-red-100">
                              Location search failed
                            </h3>
                            <p className="text-xs text-red-700 dark:text-red-300 mt-1">{part.output.error}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const { places } = part.output;
                if (!places || places.length === 0) {
                  return (
                    <div
                      key={`${messageIndex}-${partIndex}-tool`}
                      className="w-full my-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950"
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                            <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">
                              No locations found
                            </h3>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                              Try searching with different keywords or check the spelling.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${messageIndex}-${partIndex}-tool`}
                    className="w-full my-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm overflow-hidden"
                  >
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center">
                          <MapPin className="h-4 w-4 text-[hsl(var(--primary))]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold truncate">
                              {places.length} Location{places.length !== 1 ? 's' : ''} Found
                            </h3>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                              {part.output.search_type === 'forward' ? 'Address Search' : 'Coordinate Search'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Map */}
                    <div className="relative h-[360px] sm:h-[400px] bg-[hsl(var(--muted))]">
                      <MapComponent
                        center={{ lat: places[0].location.lat, lng: places[0].location.lng }}
                        places={places.map((place: any) => ({
                          name: place.name,
                          location: place.location,
                          address: place.formatted_address,
                          place_id: place.place_id,
                          types: place.types,
                        }))}
                        zoom={places.length === 1 ? 15 : 12}
                      />
                    </div>

                    {/* Results list */}
                    <div className="p-3 divide-y divide-[hsl(var(--border))]">
                      {places.map((place: any, index: number) => (
                        <div key={place.place_id || index} className="py-3">
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 w-9 h-9 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center">
                              <MapPin className="h-4 w-4 text-[hsl(var(--primary))]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-3">
                                <h4 className="text-sm font-medium text-ellipsis overflow-hidden whitespace-nowrap">
                                  {place.name}
                                </h4>
                                <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                                  {place.location.lat.toFixed(4)}, {place.location.lng.toFixed(4)}
                                </span>
                              </div>
                              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">
                                {place.formatted_address}
                              </p>
                              {place.types && place.types.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {place.types.slice(0, 3).map((type: string, typeIndex: number) => (
                                    <span
                                      key={typeIndex}
                                      className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] capitalize"
                                    >
                                      {type.replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              case 'output-error':
                return (
                  <ToolErrorDisplay
                    key={`${messageIndex}-${partIndex}-tool`}
                    errorText={part.errorText}
                    toolName="Location Search"
                  />
                );
            }
            break;

          case 'tool-movie_or_tv_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={Film}
                    text="Discovering entertainment content..."
                    color="violet"
                  />
                );
              case 'output-available':
                return <TMDBResult result={part.output} key={`${messageIndex}-${partIndex}-tool`} />;
            }
            break;

          case 'tool-stock_chart':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <StockChartLoader
                    key={`${messageIndex}-${partIndex}-tool`}
                    title={part.input?.title || 'Preparing financial analysis...'}
                    input={part.input}
                  />
                );
              case 'output-available':
                return (
                  <InteractiveStockChart
                    key={`${messageIndex}-${partIndex}-tool`}
                    title={part.input.title}
                    chart={{
                      ...part.output.chart,
                      x_scale: 'datetime',
                    }}
                    data={part.output.chart.elements}
                    stock_symbols={part.input.companies || []}
                    currency_symbols={
                      part.output.currency_symbols ||
                      part.input.currency_symbols ||
                      part.input.companies?.map(() => 'USD') || ['USD']
                    }
                    interval={part.input.time_period || '1 year'}
                    resolved_companies={
                      part.output.resolved_companies?.map((company) => ({
                        ...company,
                        ticker: company.ticker || company.name || 'N/A',
                      })) || []
                    }
                    earnings_data={
                      part.output.earnings_data?.map((earning) => ({
                        ...earning,
                        ticker: earning.ticker || 'N/A',
                      })) || []
                    }
                    news_results={part.output.news_results}
                    sec_filings={
                      part.output.sec_filings?.map((filing) => ({
                        id: filing.id,
                        title: filing.title,
                        url: filing.url,
                        content: filing.content,
                        metadata: filing.metadata,
                        requestedCompany: 'requestedCompany' in filing ? String(filing.requestedCompany) : 'N/A',
                        requestedFilingType:
                          'requestedFilingType' in filing
                            ? String(filing.requestedFilingType)
                            : 'form_type' in filing
                              ? String(filing.form_type)
                              : '10-K',
                      })) || []
                    }
                    company_statistics={part.output.company_statistics}
                    balance_sheets={part.output.balance_sheets}
                    income_statements={part.output.income_statements}
                    cash_flows={part.output.cash_flows}
                    dividends_data={part.output.dividends_data}
                    insider_transactions={part.output.insider_transactions}
                    market_movers={part.output.market_movers}
                  />
                );
            }
            break;

          case 'tool-get_weather_data':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <Card
                    key={`${messageIndex}-${partIndex}-tool`}
                    className="my-2 py-0 shadow-none bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 gap-0"
                  >
                    <CardHeader className="py-2 px-3 sm:px-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="h-5 w-32 bg-neutral-200 dark:bg-neutral-800 rounded-md animate-pulse" />
                          <div className="flex items-center mt-1 gap-2">
                            <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-800 rounded-full animate-pulse" />
                            <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-full animate-pulse" />
                          </div>
                        </div>
                        <div className="flex items-center ml-4">
                          <div className="text-right">
                            <div className="h-8 w-16 bg-neutral-200 dark:bg-neutral-800 rounded-md animate-pulse" />
                            <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-md mt-1 animate-pulse" />
                          </div>
                          <div className="h-12 w-12 flex items-center justify-center ml-2">
                            <Cloud className="h-8 w-8 text-neutral-300 dark:text-neutral-700 animate-pulse" />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {[...Array(4)].map((_, i) => (
                          <div
                            key={i}
                            className="h-7 w-28 bg-neutral-200 dark:bg-neutral-800 rounded-full animate-pulse"
                          />
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="px-3 sm:px-4">
                        <div className="h-8 w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg animate-pulse mb-4" />
                        <div className="h-[180px] w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg animate-pulse" />
                        <div className="flex justify-between mt-4 pb-4 overflow-x-auto no-scrollbar">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className="flex flex-col items-center min-w-[60px] sm:min-w-[70px] p-1.5 sm:p-2 mx-0.5"
                            >
                              <div className="h-4 w-12 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse mb-2" />
                              <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse mb-2" />
                              <div className="h-3 w-8 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="border-t border-neutral-200 dark:border-neutral-800 py-0! px-4 m-0!">
                      <div className="w-full flex justify-end items-center py-1">
                        <div className="h-3 w-32 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                      </div>
                    </CardFooter>
                  </Card>
                );
              case 'output-available':
                return <WeatherChart result={part.output} key={`${messageIndex}-${partIndex}-tool`} />;
            }
            break;

          case 'tool-web_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                return (
                  <MultiSearch
                    key={`${messageIndex}-${partIndex}-tool`}
                    result={part.output || null}
                    args={part.input ? part.input : {}}
                    annotations={annotations as DataQueryCompletionPart[]}
                  />
                );
            }
            break;

          case 'tool-datetime':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <div key={`${messageIndex}-${partIndex}-tool`} className="flex items-center gap-3 py-4 px-2">
                    <div className="h-5 w-5 relative">
                      <div className="absolute inset-0 rounded-full border-2 border-neutral-300 dark:border-neutral-700 border-t-blue-500 dark:border-t-blue-400 animate-spin" />
                    </div>
                    <span className="text-neutral-700 dark:text-neutral-300 text-sm font-medium">
                      Fetching current time...
                    </span>
                  </div>
                );
              case 'output-available':
                // Live Clock component that updates every second
                const LiveClock = memo(() => {
                  const [time, setTime] = useState(() => new Date());
                  const timerRef = useRef<NodeJS.Timeout | null>(null);

                  useEffect(() => {
                    // Sync with the nearest second
                    const now = new Date();
                    const delay = 1000 - now.getMilliseconds();

                    // Initial sync
                    const timeout = setTimeout(() => {
                      setTime(new Date());

                      // Then start the interval
                      timerRef.current = setInterval(() => {
                        setTime(new Date());
                      }, 1000);
                    }, delay);

                    return () => {
                      clearTimeout(timeout);
                      if (timerRef.current) {
                        clearInterval(timerRef.current);
                      }
                    };
                  }, []);

                  // Format the time according to the specified timezone
                  const timezone = part.output.timezone || new Intl.DateTimeFormat().resolvedOptions().timeZone;
                  const formatter = new Intl.DateTimeFormat('en-US', {
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                    hour12: true,
                    timeZone: timezone,
                  });

                  const formattedParts = formatter.formatToParts(time);
                  const timeParts = {
                    hour: formattedParts.find((part) => part.type === 'hour')?.value || '12',
                    minute: formattedParts.find((part) => part.type === 'minute')?.value || '00',
                    second: formattedParts.find((part) => part.type === 'second')?.value || '00',
                    dayPeriod: formattedParts.find((part) => part.type === 'dayPeriod')?.value || 'AM',
                  };

                  return (
                    <div className="mt-3">
                      <div className="flex items-baseline">
                        <div className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter tabular-nums text-neutral-900 dark:text-white">
                          {timeParts.hour.padStart(2, '0')}
                        </div>
                        <div className="mx-1 sm:mx-2 text-4xl sm:text-5xl md:text-6xl font-light text-neutral-400 dark:text-neutral-500">
                          :
                        </div>
                        <div className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter tabular-nums text-neutral-900 dark:text-white">
                          {timeParts.minute.padStart(2, '0')}
                        </div>
                        <div className="mx-1 sm:mx-2 text-4xl sm:text-5xl md:text-6xl font-light text-neutral-400 dark:text-neutral-500">
                          :
                        </div>
                        <div className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter tabular-nums text-neutral-900 dark:text-white">
                          {timeParts.second.padStart(2, '0')}
                        </div>
                        <div className="ml-2 sm:ml-4 text-xl sm:text-2xl font-light self-center text-neutral-400 dark:text-neutral-500">
                          {timeParts.dayPeriod}
                        </div>
                      </div>
                    </div>
                  );
                });

                LiveClock.displayName = 'LiveClock';

                return (
                  <div key={`${messageIndex}-${partIndex}-tool`} className="w-full my-6">
                    <div className="bg-white dark:bg-neutral-950 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
                      <div className="p-4 sm:p-6">
                        <div className="flex flex-col gap-4 sm:gap-6">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 tracking-wider uppercase">
                                Current Time
                              </h3>
                              <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 font-medium flex items-center gap-1.5">
                                <PhosphorClockIcon weight="regular" className="h-3 w-3 text-blue-500" />
                                {part.output.timezone || new Intl.DateTimeFormat().resolvedOptions().timeZone}
                              </div>
                            </div>
                            <LiveClock />
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                              {part.output.formatted?.date}
                            </p>
                          </div>

                          {/* Compact Technical Details */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            {part.output.formatted?.iso_local && (
                              <div className="bg-neutral-50 dark:bg-neutral-900 rounded p-3">
                                <div className="text-neutral-500 dark:text-neutral-400 mb-1">Local</div>
                                <div className="font-mono text-neutral-700 dark:text-neutral-300 text-[11px]">
                                  {part.output.formatted.iso_local}
                                </div>
                              </div>
                            )}

                            {part.output.timestamp && (
                              <div className="bg-neutral-50 dark:bg-neutral-900 rounded p-3">
                                <div className="text-neutral-500 dark:text-neutral-400 mb-1">Timestamp</div>
                                <div className="font-mono text-neutral-700 dark:text-neutral-300 text-[11px]">
                                  {part.output.timestamp}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
            }
            break;

          case 'tool-xai_web_search':
          case 'tool-xai_x_search': {
            const mergedXaiToolParts = parts.filter(isXaiMultiAgentToolPart) as XaiMultiAgentToolPart[];
            const mergedFirstXaiToolIndex = parts.findIndex(isXaiMultiAgentToolPart);

            if (partIndex !== mergedFirstXaiToolIndex) {
              return null;
            }

            const labels = mergedXaiToolParts.map((toolPart: XaiMultiAgentToolPart) =>
              getXaiMultiAgentToolLabel(toolPart.type),
            );
            const hasError = mergedXaiToolParts.some(
              (toolPart: XaiMultiAgentToolPart) => toolPart.state === 'output-error',
            );
            const errorText = mergedXaiToolParts.find(
              (toolPart: XaiMultiAgentToolPart) => toolPart.state === 'output-error',
            )?.errorText;
            const counts = labels.reduce<Record<string, number>>((acc: Record<string, number>, label: string) => {
              acc[label] = (acc[label] ?? 0) + 1;
              return acc;
            }, {});
            const summary = Object.entries(counts)
              .map(([label, count]) => {
                const pluralLabel = label === 'Web Search' ? 'Web Searches' : label;
                return count > 1 ? `${count} ${pluralLabel}` : label;
              })
              .join(' · ');
            const activityLabel = hasError ? summary : `Running ${summary}`;

            return (
              <div key={`${messageIndex}-${partIndex}-tool`} className="my-1.5">
                <div
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] bg-background/70',
                    hasError
                      ? 'border-red-500/20 text-red-600 dark:text-red-300'
                      : 'border-border/60 text-muted-foreground',
                  )}
                >
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{activityLabel}</span>
                  {hasError && errorText ? (
                    <span className="max-w-[200px] truncate text-[11px]" title={errorText}>
                      {errorText}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          }

          case 'tool-extreme_search':
            switch (part.state) {
              case 'input-streaming':
                return (
                  <div key={`${messageIndex}-${partIndex}-tool`} className="text-sm text-neutral-500">
                    Preparing extreme search...
                  </div>
                );
              case 'input-available':
              case 'output-available':
                return (
                  <ExtremeSearch
                    key={`${messageIndex}-${partIndex}-tool`}
                    // @ts-ignore - Complex type intersection resolved to never
                    toolInvocation={{ toolName: 'extreme_search', input: part.input, result: part.output }}
                    annotations={
                      (annotations?.filter(
                        (annotation) => annotation.type === 'data-extreme_search',
                      ) as DataExtremeSearchPart[]) || []
                    }
                  />
                );
            }
            break;

          case 'tool-text_translate':
            switch (part.state) {
              case 'input-streaming':
                return (
                  <div key={`${messageIndex}-${partIndex}-tool`} className="text-sm text-neutral-500">
                    Preparing translation...
                  </div>
                );
              case 'input-available':
              case 'output-available':
                return (
                  <TextTranslate key={`${messageIndex}-${partIndex}-tool`} args={part.input} result={part.output} />
                );
            }
            break;

          case 'tool-code_context':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={Code}
                    text="Getting code context..."
                    color="blue"
                  />
                );
              case 'output-available':
                return (
                  <CodeContextTool key={`${messageIndex}-${partIndex}-tool`} args={part.input} result={part.output} />
                );
            }
            break;

          case 'tool-file_query_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                const fileQuerySearchInput = part.input;
                const fileQuerySearchOutput = part.output;
                return (
                  <FileQuerySearch
                    key={`${messageIndex}-${partIndex}-tool`}
                    result={fileQuerySearchOutput || null}
                    args={fileQuerySearchInput ? fileQuerySearchInput : {}}
                    annotations={annotations as DataQueryCompletionPart[]}
                  />
                );
            }
            break;

          case 'tool-trending_movies':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={Film}
                    text="Loading trending movies..."
                    color="blue"
                  />
                );
              case 'output-available':
                return <TrendingResults result={part.output} type="movie" key={`${messageIndex}-${partIndex}-tool`} />;
            }
            break;

          case 'tool-trending_tv':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={Tv}
                    text="Loading trending TV shows..."
                    color="blue"
                  />
                );
              case 'output-available':
                return <TrendingResults result={part.output} type="tv" key={`${messageIndex}-${partIndex}-tool`} />;
            }
            break;

          case 'tool-academic_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                const academicSearchInput = part.input;
                const academicSearchOutput = part.output;
                return (
                  <AcademicPapersCard
                    key={`${messageIndex}-${partIndex}-tool`}
                    response={academicSearchOutput || null}
                    args={academicSearchInput ? academicSearchInput : {}}
                    annotations={annotations as DataQueryCompletionPart[]}
                  />
                );
            }
            break;

          case 'tool-track_flight':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <div key={`${messageIndex}-${partIndex}-tool`} className="w-full max-w-2xl mx-auto">
                    <div className="border rounded-md bg-card overflow-hidden shadow-2xs">
                      {/* Compact Header Skeleton */}
                      <div className="px-4 py-2 border-b bg-muted/40">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </div>
                        </div>
                      </div>

                      {/* Compact Body Skeleton */}
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          {/* Left */}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <Skeleton className="h-7 w-20" />
                            <Skeleton className="h-6 w-16" />
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-2.5 w-20" />
                          </div>

                          {/* Middle */}
                          <div className="flex flex-col items-center justify-center w-28 shrink-0">
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex-1 h-px bg-border"></div>
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                                <Plane className="h-3.5 w-3.5 text-primary animate-pulse" />
                              </div>
                              <div className="flex-1 h-px bg-border"></div>
                            </div>
                            <Skeleton className="h-3 w-12 mt-1" />
                          </div>

                          {/* Right */}
                          <div className="text-right min-w-0 flex-1 space-y-1.5">
                            <Skeleton className="h-7 w-20 ml-auto" />
                            <Skeleton className="h-6 w-16 ml-auto" />
                            <Skeleton className="h-3 w-32 ml-auto" />
                            <Skeleton className="h-2.5 w-20 ml-auto" />
                          </div>
                        </div>

                        {/* Inline meta skeleton */}
                        <div className="mt-3 pt-2 border-t flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              case 'output-available':
                return <FlightTracker data={part.output} key={`${messageIndex}-${partIndex}-tool`} />;
            }
            break;

          case 'tool-reddit_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                const redditSearchInput = part.input;
                const redditSearchOutput = part.output;
                return (
                  <RedditSearch
                    key={`${messageIndex}-${partIndex}-tool`}
                    result={redditSearchOutput || null}
                    args={redditSearchInput ? redditSearchInput : {}}
                    annotations={annotations as DataQueryCompletionPart[]}
                  />
                );
            }
            break;

          case 'tool-github_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                const githubSearchInput = part.input;
                const githubSearchOutput = part.output;
                return (
                  <GitHubSearch
                    key={`${messageIndex}-${partIndex}-tool`}
                    result={githubSearchOutput || null}
                    args={githubSearchInput ? githubSearchInput : {}}
                    annotations={annotations as DataQueryCompletionPart[]}
                  />
                );
            }
            break;

          case 'tool-prediction_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                const predictionSearchInput = part.input;
                const predictionSearchOutput = part.output;
                return (
                  <PredictionSearch
                    key={`${messageIndex}-${partIndex}-tool`}
                    result={predictionSearchOutput || null}
                    args={predictionSearchInput ? predictionSearchInput : {}}
                    annotations={annotations as DataQueryCompletionPart[]}
                  />
                );
            }
            break;

          case 'tool-x_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                const rawXSearchInput = part.input ?? {};
                const xSearchInput = {
                  ...rawXSearchInput,
                  includeXHandles: rawXSearchInput.includeXHandles?.filter((h): h is string => h !== undefined),
                  excludeXHandles: rawXSearchInput.excludeXHandles?.filter((h): h is string => h !== undefined),
                };
                const xSearchOutput = part.output;

                const normalizeCitation = (citation: any) => {
                  if (!citation) return null;
                  if (typeof citation === 'string') {
                    return { url: citation, title: citation, description: '' };
                  }
                  const url = typeof citation.url === 'string' ? citation.url : '';
                  const title =
                    typeof citation.title === 'string' && citation.title.length > 0
                      ? citation.title
                      : url || 'Citation';
                  return { ...citation, url, title };
                };

                return (
                  <XSearch
                    key={`${messageIndex}-${partIndex}-tool`}
                    result={
                      xSearchOutput
                        ? {
                            ...xSearchOutput,
                            searches:
                              xSearchOutput.searches?.map((search: any) => ({
                                ...search,
                                query: search.query || '',
                                sources:
                                  search.sources?.filter((s: any): s is NonNullable<typeof s> => s !== null) || [],
                                citations: (search.citations ?? []).map(normalizeCitation).filter(Boolean),
                              })) || [],
                            dateRange: xSearchOutput.dateRange || '',
                            handles: xSearchOutput.handles || [],
                          }
                        : null
                    }
                    args={xSearchInput}
                    annotations={annotations as DataQueryCompletionPart[]}
                  />
                );
            }
            break;

          case 'tool-youtube_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={YoutubeIcon}
                    text="Searching YouTube..."
                    color="red"
                  />
                );
              case 'output-available': {
                const parseLegacyCount = (value: unknown): number | undefined => {
                  if (typeof value === 'number' && Number.isFinite(value)) {
                    return value;
                  }
                  if (typeof value === 'string') {
                    const digits = value.replace(/[^0-9]/g, '');
                    if (!digits) return undefined;
                    const parsed = Number(digits);
                    return Number.isFinite(parsed) ? parsed : undefined;
                  }
                  return undefined;
                };

                const normalizedResults = Array.isArray(part.output?.results)
                  ? part.output.results.map((video: any) => {
                      if (!video) return video;
                      if (video.stats) return video;
                      const views = parseLegacyCount(video.views);
                      const likes = parseLegacyCount(video.likes);

                      if (views == null && likes == null) {
                        return video;
                      }

                      return {
                        ...video,
                        stats: {
                          ...(views != null ? { views } : {}),
                          ...(likes != null ? { likes } : {}),
                        },
                      };
                    })
                  : [];

                return (
                  <YouTubeSearchResults
                    results={{
                      ...(part.output ?? { results: [] }),
                      results: normalizedResults,
                    }}
                    key={`${messageIndex}-${partIndex}-tool`}
                  />
                );
              }
            }
            break;

          case 'tool-spotify_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SpotifySearchResults
                    key={`${messageIndex}-${partIndex}-tool`}
                    result={{
                      success: true,
                      query: part.input?.query || '',
                      searchTypes: ['track'],
                      tracks: [],
                      artists: [],
                      albums: [],
                      playlists: [],
                      totals: { tracks: 0, artists: 0, albums: 0, playlists: 0 },
                    }}
                    isLoading={true}
                  />
                );
              case 'output-available':
                return <SpotifySearchResults key={`${messageIndex}-${partIndex}-tool`} result={part.output} />;
            }
            break;

          case 'tool-search_memories':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={MemoryIcon}
                    text="Searching memories..."
                    color="blue"
                  />
                );
              case 'output-available':
                // Handle error responses
                if (!part.output.success) {
                  return (
                    <div className="w-full my-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900 flex items-center justify-center">
                            <MemoryIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-red-900 dark:text-red-100">Memory search failed</h3>
                            <p className="text-xs text-red-700 dark:text-red-300 mt-1">{part.output.error}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const { results, count } = part.output;
                if (!results || results.length === 0) {
                  return (
                    <div className="w-full my-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                            <MemoryIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">
                              No memories found
                            </h3>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                              No memories match your search query. Try different keywords.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="w-full my-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="px-2 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center shrink-0">
                            <MemoryIcon className="h-4 w-4 text-[hsl(var(--primary))]" />
                          </div>
                          <h3 className="text-sm font-semibold">
                            {count} Memor{count !== 1 ? 'ies' : 'y'} Found
                          </h3>
                        </div>
                      </div>
                    </div>

                    {/* Results list */}
                    <div className="">
                      {results.map((memory: any, index: number) => (
                        <div key={memory.id || memory.uuid || index} className="px-4 py-2">
                          <p className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">
                            {/* SuperMemory results carry chunks[].content; Graphiti results carry
                                a flat `fact` string instead — no `chunks` field at all. */}
                            • {memory.chunks?.[0]?.content || memory.memory || memory.fact || ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
            }
            break;

          case 'tool-add_memory':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={MemoryIcon}
                    text="Adding memory..."
                    color="green"
                  />
                );
              case 'output-available':
                // Handle error responses
                if (!part.output.success) {
                  return (
                    <div className="w-full my-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900 flex items-center justify-center">
                            <MemoryIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-red-900 dark:text-red-100">Failed to add memory</h3>
                            <p className="text-xs text-red-700 dark:text-red-300 mt-1">{part.output.error}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const { memory: addedMemory } = part.output;
                return (
                  <div className="w-full my-4 rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 shadow-sm overflow-hidden">
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
                            <MemoryIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                              Memory Added Successfully
                            </h3>
                            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                              Your information has been saved to memory for future reference.
                            </p>
                          </div>
                        </div>
                      </div>

                      {addedMemory && (
                        <div className="mt-3 p-3 bg-white dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                          {addedMemory.title && (
                            <h4 className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
                              {addedMemory.title}
                            </h4>
                          )}
                          <p className="text-xs text-green-700 dark:text-green-300">
                            {addedMemory.summary || addedMemory.content || part.input.memory || 'Memory stored'}
                          </p>
                          {addedMemory.type && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300">
                                {addedMemory.type}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
            }
            break;

          case 'tool-connectors_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <ConnectorsSearchResults
                    key={`${messageIndex}-${partIndex}-tool`}
                    results={[]}
                    query={part.input?.query || ''}
                    totalResults={0}
                    isLoading={true}
                  />
                );
              case 'output-available':
                return (
                  <ConnectorsSearchResults
                    key={`${messageIndex}-${partIndex}-tool`}
                    results={part.output?.success ? part.output.results : []}
                    query={part.output?.success ? part.output.query : ''}
                    totalResults={part.output?.success ? part.output.count : 0}
                  />
                );
            }
            break;

          case 'tool-nearby_places_search':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <NearbySearchSkeleton type={part.input?.type || 'places'} key={`${messageIndex}-${partIndex}-tool`} />
                );
              case 'output-available':
                // Handle error cases or missing data
                if (!part.output.success || !part.output.center) {
                  return (
                    <div
                      key={`${messageIndex}-${partIndex}-tool`}
                      className="p-4 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-lg"
                    >
                      <p className="text-red-700 dark:text-red-300">
                        {part.output.error ||
                          'Unable to find nearby places. Please try a different location or search term.'}
                      </p>
                    </div>
                  );
                }

                return (
                  <NearbySearchMapView
                    key={`${messageIndex}-${partIndex}-tool`}
                    center={{
                      lat: part.output.center?.lat || 0,
                      lng: part.output.center?.lng || 0,
                    }}
                    places={
                      part.output.places?.map((place: any) => ({
                        name: place.name,
                        location: place.location,
                        place_id: place.place_id,
                        vicinity: place.formatted_address,
                        rating: place.rating,
                        reviews_count: place.reviews_count,
                        reviews: place.reviews,
                        price_level: place.price_level,
                        photos: place.photos,
                        is_closed: !place.is_open,
                        type: place.types?.[0]?.replace(/_/g, ' '),
                        source: place.source,
                        phone: place.phone,
                        website: place.website,
                        hours: place.opening_hours,
                        distance: place.distance,
                      })) || []
                    }
                    type={part.output.type || ''}
                    query={part.output.query || ''}
                    searchRadius={'radius' in part.output ? Number(part.output.radius) || 1000 : 1000}
                  />
                );
            }
            break;

          case 'tool-currency_converter':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                return (
                  <CurrencyConverter
                    key={`${messageIndex}-${partIndex}-tool`}
                    toolInvocation={{
                      toolName: 'currency_converter',
                      input: part.input || {},
                      result: part.output || null,
                    }}
                    result={part.output}
                  />
                );
            }
            break;

          case 'tool-code_interpreter':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
              case 'output-available':
                return (
                  <div key={`${messageIndex}-${partIndex}-tool`} className="space-y-3 w-full overflow-hidden">
                    <CodeInterpreterView
                      code={part.input?.code || ''}
                      output={part.output?.message}
                      error={part.output && 'error' in part.output ? String(part.output.error) : undefined}
                      language="python"
                      title={part.input?.title || 'Code Execution'}
                      status={
                        part.output && 'error' in part.output && part.output.error
                          ? 'error'
                          : part.output
                            ? 'completed'
                            : 'running'
                      }
                    />

                    {part.output?.chart && (
                      <div className="pt-1 overflow-x-auto">
                        {part.output.chart.type === 'image' && part.output.chart.png ? (
                          <img
                            src={part.output.chart.png}
                            alt={part.output.chart.title || 'Chart'}
                            className="max-w-full rounded-lg"
                          />
                        ) : (
                          <InteractiveChart chart={part.output.chart} />
                        )}
                      </div>
                    )}

                    {part.output?.files && part.output.files.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-2">
                        {part.output.files.map((file, fileIndex) => (
                          <a
                            key={`${file.url}-${fileIndex}`}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                          >
                            <Download className="size-3.5" />
                            {file.filename}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
            }
            break;

          case 'tool-retrieve':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <div
                    key={`${messageIndex}-${partIndex}-tool`}
                    className="rounded-xl border border-border/60 my-4 overflow-hidden bg-card/30"
                  >
                    {/* Header */}
                    <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground/40 animate-pulse" />
                      <span className="font-pixel text-xs text-muted-foreground/80 uppercase tracking-wider">
                        Retrieving
                      </span>
                      <Spinner className="size-3 text-muted-foreground/40 ml-auto" />
                    </div>
                    <div className="p-4">
                      <div className="flex gap-3">
                        <div className="relative w-10 h-10 shrink-0 rounded-lg bg-muted/30 animate-pulse flex items-center justify-center">
                          <Globe className="h-4 w-4 text-muted-foreground/20" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2.5">
                          <div className="h-4 w-3/4 bg-muted/30 animate-pulse rounded" />
                          <div className="flex gap-2">
                            <div
                              className="h-3 w-20 bg-muted/20 animate-pulse rounded"
                              style={{ animationDelay: '50ms' }}
                            />
                            <div
                              className="h-3 w-28 bg-muted/20 animate-pulse rounded"
                              style={{ animationDelay: '100ms' }}
                            />
                          </div>
                          <div className="space-y-1">
                            <div
                              className="h-2.5 w-full bg-muted/20 animate-pulse rounded"
                              style={{ animationDelay: '150ms' }}
                            />
                            <div
                              className="h-2.5 w-4/5 bg-muted/15 animate-pulse rounded"
                              style={{ animationDelay: '200ms' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              case 'output-available':
                // Handle error responses
                if (part.output && 'error' in part.output && part.output.error && !part.output.results?.length) {
                  return (
                    <div
                      key={`${messageIndex}-${partIndex}-tool`}
                      className="border border-red-200 dark:border-red-500 rounded-xl my-4 p-4 bg-red-50 dark:bg-red-950/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                          <Globe className="h-4 w-4 text-red-600 dark:text-red-300" />
                        </div>
                        <div>
                          <div className="text-red-700 dark:text-red-300 text-sm font-medium">
                            Error retrieving content
                          </div>
                          <div className="text-red-600/80 dark:text-red-400/80 text-xs mt-1">
                            {String(part.output.error)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Use the new RetrieveResults component for both single and multi-URL
                return <RetrieveResults key={`${messageIndex}-${partIndex}-tool`} result={part.output} />;
            }
            break;

          case 'tool-coin_ohlc':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={TrendingUpIcon}
                    text="Loading OHLC candlestick data..."
                    color="green"
                  />
                );
              case 'output-available':
                return (
                  <CryptoChart
                    result={part.output}
                    coinId={part.input.coinId}
                    chartType="candlestick"
                    key={`${messageIndex}-${partIndex}-tool`}
                  />
                );
            }
            break;

          case 'tool-coin_data':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={DollarSign}
                    text="Fetching comprehensive coin data..."
                    color="blue"
                  />
                );
              case 'output-available':
                return (
                  <CryptoCoinsData
                    result={part.output}
                    coinId={part.input.coinId}
                    key={`${messageIndex}-${partIndex}-tool`}
                  />
                );
            }
            break;

          case 'tool-coin_data_by_contract':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={DollarSign}
                    text="Fetching token data by contract..."
                    color="violet"
                  />
                );
              case 'output-available':
                return (
                  <CryptoCoinsData
                    result={part.output}
                    contractAddress={part.input.contractAddress}
                    key={`${messageIndex}-${partIndex}-tool`}
                  />
                );
            }
            break;

          case 'tool-greeting':
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return (
                  <SearchLoadingState
                    key={`${messageIndex}-${partIndex}-tool`}
                    icon={User2}
                    text="Preparing greeting..."
                    color="gray"
                  />
                );
              case 'output-available':
                return (
                  <div
                    key={`${messageIndex}-${partIndex}-tool`}
                    className="group my-2 rounded-md border border-neutral-200/60 dark:border-neutral-700/60 bg-white/80 dark:bg-neutral-900/80 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all duration-200"
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {part.output.timeEmoji && (
                          <div className="mt-0.5 w-5 h-5 rounded-md bg-neutral-600 flex items-center justify-center">
                            <span className="text-xs">{part.output.timeEmoji}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                              {part.output.greeting}
                            </span>
                            <span className="text-neutral-400">•</span>
                            <span className="text-neutral-500 dark:text-neutral-400">{part.output.dayOfWeek}</span>
                          </div>
                          <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                            {part.output.professionalMessage}
                          </div>
                          {part.output.helpfulTip && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              {part.output.helpfulTip}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
            }
            break;
          case 'tool-skill': {
            if (part.state === 'output-available') {
              const loadedSkills = (part.output as { loadedSkills?: Array<{ id: string; name: string }> } | undefined)
                ?.loadedSkills;
              const label =
                !loadedSkills || loadedSkills.length === 0
                  ? 'Learned skill'
                  : loadedSkills.length === 1
                    ? `Learned ${loadedSkills[0].name}`
                    : `Learned ${loadedSkills.map((s) => s.name).join(', ')}`;
              return (
                <div
                  key={`${messageIndex}-${partIndex}-tool`}
                  className="my-2 inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
                >
                  <Sparkles className="size-3 shrink-0" strokeWidth={2} />
                  <span>{label}</span>
                </div>
              );
            }
            return (
              <SearchLoadingState
                key={`${messageIndex}-${partIndex}-tool`}
                icon={Sparkles}
                text="Loading skill..."
                color="blue"
              />
            );
          }

          case 'tool-generate_image': {
            const generatedImageUrl =
              part.state === 'output-available' && part.output.success ? part.output.imageUrl : undefined;
            return (
              <GeneratedImageCard
                key={`${messageIndex}-${partIndex}-tool`}
                mode="generate"
                state={toImageCardState(part.state)}
                prompt={part.input?.prompt}
                size={part.input?.size}
                imageUrl={generatedImageUrl}
                error={
                  part.state === 'output-available' && !part.output.success
                    ? part.output.error
                    : part.state === 'output-error'
                      ? part.errorText
                      : undefined
                }
                isHidden={generatedImageUrl ? hiddenImageUrls?.has(generatedImageUrl) : undefined}
                canToggleHidden={chatId ? (user && isOwner) || (!user && selectedVisibilityType === 'private') : false}
                onToggleHidden={
                  generatedImageUrl && chatId
                    ? (hidden: boolean) => onToggleImageHidden?.(generatedImageUrl, hidden)
                    : undefined
                }
              />
            );
          }

          case 'tool-edit_image': {
            const editedImageUrl =
              part.state === 'output-available' && part.output.success ? part.output.imageUrl : undefined;
            return (
              <GeneratedImageCard
                key={`${messageIndex}-${partIndex}-tool`}
                mode="edit"
                state={toImageCardState(part.state)}
                prompt={part.input?.prompt}
                sourceImageUrl={
                  (part.state === 'output-available' && part.output.success ? part.output.originalUrl : undefined) ??
                  part.input?.image_url
                }
                imageUrl={editedImageUrl}
                error={
                  part.state === 'output-available' && !part.output.success
                    ? part.output.error
                    : part.state === 'output-error'
                      ? part.errorText
                      : undefined
                }
                isHidden={editedImageUrl ? hiddenImageUrls?.has(editedImageUrl) : undefined}
                canToggleHidden={chatId ? (user && isOwner) || (!user && selectedVisibilityType === 'private') : false}
                onToggleHidden={
                  editedImageUrl && chatId
                    ? (hidden: boolean) => onToggleImageHidden?.(editedImageUrl, hidden)
                    : undefined
                }
              />
            );
          }

          default:
            return <DynamicToolInvocationCard part={part} compact={true} />;
        }
      } else {
        // Legacy tool invocation without state - show as loading or fallback
        console.warn('Legacy tool part without state:', part);
        return (
          <div
            key={`${messageIndex}-${partIndex}-tool-legacy`}
            className="my-4 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg"
          >
            <h3 className="font-medium mb-2">Tool: Unknown</h3>
            <pre className="text-xs overflow-auto">{JSON.stringify(part, null, 2)}</pre>
          </div>
        );
      }
    }

    // Log unhandled part types for debugging
    console.log(
      'Unhandled part type:',
      typeof part === 'object' && part !== null && 'type' in part ? part.type : 'unknown',
      part,
    );

    return null;
  },
  (prevProps: MessagePartRendererProps, nextProps: MessagePartRendererProps) => {
    const areEqual =
      isEqual(prevProps.part, nextProps.part) &&
      prevProps.messageIndex === nextProps.messageIndex &&
      prevProps.partIndex === nextProps.partIndex &&
      isEqual(prevProps.parts, nextProps.parts) &&
      isEqual(prevProps.message, nextProps.message) &&
      prevProps.status === nextProps.status &&
      prevProps.hasActiveToolInvocations === nextProps.hasActiveToolInvocations &&
      isEqual(prevProps.reasoningVisibilityMap, nextProps.reasoningVisibilityMap) &&
      isEqual(prevProps.reasoningFullscreenMap, nextProps.reasoningFullscreenMap) &&
      prevProps.user?.id === nextProps.user?.id &&
      prevProps.isOwner === nextProps.isOwner &&
      prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
      prevProps.chatId === nextProps.chatId &&
      // fast-deep-equal doesn't special-case Set (Object.keys(set) is always
      // []), so two different-content Sets would compare equal — reference
      // equality is correct here since hiddenImageUrls is always replaced
      // with a new Set instance on change (see chat-interface.tsx).
      prevProps.hiddenImageUrls === nextProps.hiddenImageUrls &&
      isEqual(prevProps.annotations, nextProps.annotations);

    // Debug logging (can be removed in production)
    if (!areEqual) {
      console.log('MessagePartRenderer re-rendering');
    }

    return areEqual;
  },
);

MessagePartRenderer.displayName = 'MessagePartRenderer';
