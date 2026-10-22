import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { DynamicToolUIPart, ReasoningUIPart } from 'ai';
import { MarkdownRenderer } from '@/components/markdown';
import { AppsIcon } from '@/components/icons/apps-icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { Spinner } from '../ui/spinner';
import type { ChatMessage } from '@/lib/types';
import { UseChatHelpers } from '@ai-sdk/react';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { Code, Clock, Check, X, AlertCircle } from 'lucide-react';
import { formatDynamicToolName, getDynamicStepState, ToolErrorDisplay, CopyIcon } from './shared';
import {
  McpInputPill,
  extractApprovalData,
  extractMcpAppRenderData,
  McpAppOutputBlock,
  McpApprovalCard,
  McpOutputBlock,
  McpInlineElicitationCard,
  type McpAppRenderData,
  type InlineElicitationData,
} from './mcp';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

export type McpTimelineEntry =
  | { kind: 'tool'; part: DynamicToolUIPart; originalIndex: number; id: string }
  | { kind: 'reasoning'; text: string; state?: ReasoningUIPart['state']; id: string }
  | { kind: 'text'; text: string; id: string };

// MCP tool inputs are arbitrary JSON; only an object can be shown as pills.
function asToolInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
}

export const DynamicToolInvocationCard = ({
  part,
  compact = false,
  sendMessage,
}: {
  part: DynamicToolUIPart;
  compact?: boolean;
  sendMessage?: UseChatHelpers<ChatMessage>['sendMessage'];
}) => {
  const toolLabel = formatDynamicToolName(part.type, part.toolName);
  const toolInput = asToolInput(part.input);
  const hasRawOutput = 'output' in part && part.output !== undefined;
  const isStreaming = part.state === 'input-streaming' || part.state === 'input-available';
  const isError = part.state === 'output-error';
  const approval = hasRawOutput ? extractApprovalData(part.output) : null;
  const appOutput = hasRawOutput ? extractMcpAppRenderData(part.output) : null;
  const [isExpanded, setIsExpanded] = useState(!!approval || !!appOutput);
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'confirmed' | 'cancelled'>('pending');

  if (isStreaming) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border/60 overflow-hidden bg-card/30',
          compact ? 'mt-1' : 'w-full my-3',
        )}
      >
        <div className="px-4 py-2.5 flex items-center gap-2">
          <AppsIcon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 animate-pulse" />
          <span className="font-pixel text-[10px] text-muted-foreground/70 uppercase tracking-wider truncate">
            {toolLabel}
          </span>
          <Spinner className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-auto" />
        </div>
        {toolInput && Object.keys(toolInput).length > 0 && (
          <div className="px-4 pb-4">
            <McpInputPill input={toolInput} />
          </div>
        )}
      </div>
    );
  }

  if (isError) {
    return <ToolErrorDisplay errorText={part.errorText || 'Dynamic tool execution failed'} toolName={toolLabel} />;
  }

  return (
    <div
      className={cn('rounded-xl border border-border/60 overflow-hidden bg-card/30', compact ? 'mt-1' : 'w-full my-3')}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setIsExpanded((p) => !p)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AppsIcon className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          <span className="font-pixel text-[10px] text-muted-foreground/80 uppercase tracking-wider truncate">
            {toolLabel}
          </span>
          {approval && (
            <span
              className={cn(
                'text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0 border transition-colors duration-300',
                approvalStatus === 'confirmed'
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : approvalStatus === 'cancelled'
                    ? 'text-muted-foreground bg-muted/50 border-border/50'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
              )}
            >
              {approvalStatus === 'confirmed'
                ? '✓ Confirmed'
                : approvalStatus === 'cancelled'
                  ? '✕ Cancelled'
                  : 'Awaiting approval'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <svg
            className={cn(
              'h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180',
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border/40 overflow-hidden">
          {appOutput ? (
            <McpAppOutputBlock
              app={appOutput}
              toolInput={toolInput}
              toolOutput={part.output}
              sendMessage={sendMessage}
            />
          ) : (
            <>
              {/* Input pills */}
              {toolInput && Object.keys(toolInput).length > 0 && (
                <div className="px-3.5 py-2 border-b border-border/30">
                  <McpInputPill input={toolInput} />
                </div>
              )}
              {/* Approval card or raw output */}
              {hasRawOutput &&
                (approval ? (
                  <McpApprovalCard approval={approval} sendMessage={sendMessage} onStatusChange={setApprovalStatus} />
                ) : (
                  <McpOutputBlock output={part.output} />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const DynamicToolStepper = ({
  entries,
  messageIndex,
  startIndex,
  sendMessage,
  inlineElicitations,
  onInlineElicitationResolved,
}: {
  entries: McpTimelineEntry[];
  sendMessage?: UseChatHelpers<ChatMessage>['sendMessage'];
  messageIndex: number;
  startIndex: number;
  inlineElicitations?: InlineElicitationData[];
  onInlineElicitationResolved?: (elicitationId: string) => void;
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const runningEntryEndRef = useRef<HTMLDivElement>(null);
  const prevEntryCountRef = useRef(entries.length);
  const userScrolledUpRef = useRef(false);
  const lastTouchYRef = useRef<number | null>(null);
  const previousScrollTopRef = useRef(0);
  const [accordionValue, setAccordionValue] = useState<string>('steps');
  const scrollStepperToTarget = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    const target = runningEntryEndRef.current ?? bottomRef.current;
    if (!container || !target) return;

    // Keep scrolling confined to the stepper container (never page-level).
    const nextTop = Math.max(0, target.offsetTop - container.clientHeight + target.offsetHeight);
    container.scrollTo({ top: nextTop, behavior });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const RESUME_AUTOSCROLL_THRESHOLD = 24;

    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const scrolledUp = container.scrollTop < previousScrollTopRef.current - 1;
      previousScrollTopRef.current = container.scrollTop;

      if (scrolledUp && distanceFromBottom > RESUME_AUTOSCROLL_THRESHOLD) {
        userScrolledUpRef.current = true;
      }

      // Keep autoscroll paused once user scrolls up, and only resume near bottom.
      if (distanceFromBottom <= RESUME_AUTOSCROLL_THRESHOLD) {
        userScrolledUpRef.current = false;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        userScrolledUpRef.current = true;
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      lastTouchYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (y == null || lastTouchYRef.current == null) return;
      const isUserScrollingUp = y > lastTouchYRef.current + 3;
      if (isUserScrollingUp) {
        userScrolledUpRef.current = true;
      }
      lastTouchYRef.current = y;
    };

    const handleTouchEnd = () => {
      lastTouchYRef.current = null;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    previousScrollTopRef.current = container.scrollTop;

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    if (entries.length !== prevEntryCountRef.current) {
      prevEntryCountRef.current = entries.length;
      if (!userScrolledUpRef.current) {
        scrollStepperToTarget('smooth');
      }
    }
  }, [entries.length, scrollStepperToTarget]);

  const lastLoadingEntryIndex = useMemo(() => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (
        (entry.kind === 'tool' && (entry.part.state === 'input-streaming' || entry.part.state === 'input-available')) ||
        (entry.kind === 'reasoning' && entry.state === 'streaming')
      ) {
        return index;
      }
    }

    return -1;
  }, [entries]);

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    scrollStepperToTarget('smooth');
  }, [entries, lastLoadingEntryIndex, scrollStepperToTarget]);

  const toolEntries = useMemo(
    () => entries.filter((entry): entry is Extract<McpTimelineEntry, { kind: 'tool' }> => entry.kind === 'tool'),
    [entries],
  );
  const isAnyLoading = entries.some(
    (entry) =>
      (entry.kind === 'tool' && (entry.part.state === 'input-streaming' || entry.part.state === 'input-available')) ||
      (entry.kind === 'reasoning' && entry.state === 'streaming'),
  );
  const hasErrors = toolEntries.some((entry) => entry.part.state === 'output-error');

  // Collect ALL completed tool entries that have an app UI — shown stacked in the App tab
  const appEntries = useMemo(() => {
    const result: Array<{ entry: Extract<McpTimelineEntry, { kind: 'tool' }>; appData: McpAppRenderData }> = [];
    for (const entry of toolEntries) {
      if (entry.part.state === 'output-available' && 'output' in entry.part) {
        const appData = extractMcpAppRenderData(entry.part.output);
        if (appData) result.push({ entry, appData });
      }
    }
    return result;
  }, [toolEntries]);

  const hasApp = appEntries.length > 0;
  const [activeTab, setActiveTab] = useState<string>(hasApp ? 'app' : 'steps');

  // Switch to app tab when app output first appears
  const [hadApp, setHadApp] = useState(hasApp);
  if (hasApp !== hadApp) {
    setHadApp(hasApp);
    if (hasApp) setActiveTab('app');
  }

  return (
    <div key={`${messageIndex}-${startIndex}-dynamic-stepper`} className="w-full my-3">
      <Accordion type="single" collapsible value={accordionValue} onValueChange={setAccordionValue}>
        <AccordionItem
          value="steps"
          className="rounded-xl border border-border/60 bg-card/30 overflow-hidden border-b!"
        >
          {/* Trigger */}
          <AccordionTrigger className="px-4 py-2.5 hover:bg-muted/20 hover:no-underline transition-colors [&>svg]:hidden">
            <div className="flex items-center justify-between w-full gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <AppsIcon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-colors',
                    isAnyLoading && 'text-muted-foreground/60 animate-pulse',
                    hasErrors && !isAnyLoading && 'text-red-500',
                    !isAnyLoading && !hasErrors && 'text-foreground/70',
                  )}
                />
                <span className="font-pixel text-[10px] text-muted-foreground/80 uppercase tracking-wider">Apps</span>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                  {`${toolEntries.length} ${toolEntries.length === 1 ? 'step' : 'steps'}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <svg
                  className="h-3 w-3 text-muted-foreground/60 transition-transform duration-200 group-data-[state=open]:rotate-180"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </AccordionTrigger>

          <AccordionContent className="pb-0">
            {/* Tab bar — only shown when there's an app output */}
            {hasApp && (
              <div className="px-2.5 py-2 border-t border-b border-border bg-background overflow-x-auto no-scrollbar">
                <KumoTabs
                  variant="segmented"
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full [--color-kumo-tint:var(--accent)] [--color-kumo-base:var(--background)] [--color-kumo-recessed:var(--muted)] [--color-kumo-surface:var(--card)] [--text-color-kumo-default:var(--foreground)] [--text-color-kumo-strong:var(--muted-foreground)] [--text-color-kumo-subtle:var(--muted-foreground)] [--color-kumo-ring:var(--border)]"
                  listClassName="w-full [&>button]:flex-1 [&>button]:justify-center"
                  tabs={[
                    {
                      value: 'app',
                      label: (
                        <span className="inline-flex items-center gap-1.5 leading-none">
                          <AppsIcon className="h-3 w-3 shrink-0" />
                          <span>App</span>
                          {appEntries.length > 1 && (
                            <span className="text-[10px] opacity-60 translate-y-px tabular-nums">
                              {appEntries.length}
                            </span>
                          )}
                        </span>
                      ),
                    },
                    {
                      value: 'steps',
                      label: (
                        <span className="inline-flex items-center gap-1.5 leading-none">
                          <svg
                            className="h-3 w-3 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                          <span>Steps</span>
                          <span className="text-[10px] opacity-60 translate-y-px tabular-nums">
                            {toolEntries.length}
                          </span>
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            )}

            {/* App tab — all app outputs stacked */}
            {hasApp && activeTab === 'app' && (
              <div className="overflow-hidden divide-y divide-border/40">
                {appEntries.map(({ entry, appData }, idx) => (
                  <McpAppOutputBlock
                    key={entry.id ?? idx}
                    app={appData}
                    toolInput={asToolInput(entry.part.input)}
                    toolOutput={entry.part.output}
                    sendMessage={sendMessage}
                  />
                ))}
              </div>
            )}

            {/* Steps tab (or only content when no app) */}
            {(!hasApp || activeTab === 'steps') && (
              <div
                ref={scrollContainerRef}
                className={cn(
                  'border-t border-border/40 px-4 py-3 max-h-[62vh] overflow-y-auto overscroll-contain',
                  hasApp && 'border-t-0',
                )}
              >
                <div className="flex flex-col">
                  {entries.map((entry, index) => {
                    const stepState =
                      entry.kind === 'tool'
                        ? getDynamicStepState(entry.part)
                        : entry.kind === 'reasoning'
                          ? entry.state === 'streaming'
                            ? 'loading'
                            : 'done'
                          : 'done';
                    const isLast = index === entries.length - 1 && !inlineElicitations?.length;
                    const isLastLoadingEntry = index === lastLoadingEntryIndex;

                    return (
                      <div key={entry.id} className="flex gap-2.5 w-full min-w-0">
                        {/* Left: dot + line */}
                        <div className={cn('relative flex flex-col items-center shrink-0 pt-[3px]', !isLast && 'pb-3')}>
                          <div
                            className={cn(
                              'relative z-10 size-4 rounded-full border flex items-center justify-center shrink-0',
                              stepState === 'error' && 'border-red-500 bg-red-50 dark:bg-red-950',
                              stepState === 'loading' && 'border-border bg-muted',
                              stepState === 'done' && 'border-border bg-muted',
                            )}
                          >
                            {stepState === 'loading' && <Spinner className="h-2.5 w-2.5 text-muted-foreground" />}
                            {stepState === 'done' && <Check className="h-2.5 w-2.5 text-foreground/70" />}
                            {stepState === 'error' && <X className="h-2.5 w-2.5 text-red-500" />}
                          </div>
                          {!isLast && (
                            <div
                              className="absolute left-1/2 -translate-x-1/2 w-px bg-border/60"
                              style={{ top: '19px', bottom: '-4px' }}
                            />
                          )}
                        </div>
                        {/* Right: label + content */}
                        <div className={cn('flex-1 min-w-0', !isLast && 'pb-3')}>
                          <span
                            className={cn(
                              'font-pixel! text-[10px] uppercase tracking-wider truncate block leading-[1.6]',
                              stepState === 'error' && 'text-red-600 dark:text-red-400',
                              stepState === 'loading' && 'text-muted-foreground',
                              stepState === 'done' && 'text-foreground',
                            )}
                          >
                            {entry.kind === 'tool'
                              ? formatDynamicToolName(entry.part.type, entry.part.toolName)
                              : entry.kind === 'reasoning'
                                ? 'Reasoning'
                                : 'Text'}
                          </span>
                          <div className="mt-1 min-w-0">
                            {entry.kind === 'tool' ? (
                              <DynamicToolInvocationCard part={entry.part} compact={true} sendMessage={sendMessage} />
                            ) : entry.kind === 'reasoning' ? (
                              <Accordion
                                type="single"
                                collapsible
                                defaultValue={stepState === 'loading' ? 'reasoning' : undefined}
                              >
                                <AccordionItem value="reasoning" className="border-0">
                                  <AccordionTrigger className="py-1 text-[10px] text-muted-foreground/70 hover:no-underline hover:text-muted-foreground font-pixel! uppercase tracking-wider">
                                    Details
                                  </AccordionTrigger>
                                  <AccordionContent className="pb-1">
                                    <div className="text-[12px] text-foreground/80 leading-relaxed font-pixel! **:text-xs! **:font-be-vietnam-pro!">
                                      <MarkdownRenderer content={entry.text} />
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              </Accordion>
                            ) : (
                              <div className="text-[12px] text-foreground/85 leading-relaxed whitespace-pre-wrap wrap-break-word">
                                <MarkdownRenderer content={entry.text} />
                              </div>
                            )}
                          </div>
                          {isLastLoadingEntry ? <div ref={runningEntryEndRef} className="h-px w-full" /> : null}
                        </div>
                      </div>
                    );
                  })}
                  {inlineElicitations &&
                    inlineElicitations.length > 0 &&
                    onInlineElicitationResolved &&
                    inlineElicitations.map((elicitation, eli) => {
                      const isLastElicitation = eli === inlineElicitations.length - 1;
                      return (
                        <div key={elicitation.elicitationId} className="flex gap-2.5 w-full min-w-0">
                          <div
                            className={cn(
                              'relative flex flex-col items-center shrink-0 pt-[3px]',
                              !isLastElicitation && 'pb-3',
                            )}
                          >
                            <div className="relative z-10 size-4 rounded-full border flex items-center justify-center shrink-0 border-border bg-muted">
                              <AlertCircle className="h-2.5 w-2.5 text-amber-500" />
                            </div>
                            {!isLastElicitation && (
                              <div
                                className="absolute left-1/2 -translate-x-1/2 w-px bg-border/60"
                                style={{ top: '19px', bottom: '-4px' }}
                              />
                            )}
                          </div>
                          <div className={cn('flex-1 min-w-0', !isLastElicitation ? 'pb-3' : 'pb-3')}>
                            <span className="font-pixel! text-[10px] uppercase tracking-wider truncate block leading-[1.6] text-foreground">
                              {inlineElicitations.length > 1
                                ? `Approval needed · ${elicitation.serverName}`
                                : 'Approval needed'}
                            </span>
                            <div className="mt-1 min-w-0">
                              <McpInlineElicitationCard
                                elicitation={elicitation}
                                onResolved={onInlineElicitationResolved}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  <div ref={bottomRef} />
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export const CodeContextTool: React.FC<{ args: any; result: any }> = ({ args, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { copy } = useCopyToClipboard();

  if (!result) {
    return (
      <div className="group my-2 p-3 rounded-md border border-neutral-200/60 dark:border-neutral-700/60 bg-neutral-50/30 dark:bg-neutral-900/30">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-md bg-neutral-600 flex items-center justify-center opacity-80">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="h-2.5 w-20 bg-neutral-300 dark:bg-neutral-600 rounded-sm animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const responseText = result?.response || result;
  const shouldShowAccordion = responseText && responseText.length > 500;
  const previewText = shouldShowAccordion ? responseText.slice(0, 400) + '...' : responseText;

  return (
    <div className="group my-2 rounded-md border border-neutral-200/60 dark:border-neutral-700/60 bg-white/80 dark:bg-neutral-900/80 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all duration-200">
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center">
            <Code className="w-2.5 h-2.5 text-white" />
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">Code Context</span>
                <span className="text-neutral-400">•</span>
                <span className="text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">
                  {args ? args.query : ''}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Copy button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copy(responseText, 'Code context copied to clipboard')}
                  className="h-6 w-6 p-0 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <CopyIcon className="h-[15px] w-[15px] text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200" />
                </Button>

                {/* Metadata badges */}
                {result?.resultsCount !== undefined && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-0 text-xs px-2 py-0.5"
                    >
                      {result.resultsCount} results
                    </Badge>
                    {result.outputTokens && (
                      <Badge
                        variant="secondary"
                        className="rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-0 text-xs px-2 py-0.5"
                      >
                        {result.outputTokens} tokens
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="space-y-2">
              {shouldShowAccordion ? (
                <Accordion
                  type="single"
                  collapsible
                  value={isExpanded ? 'context' : ''}
                  onValueChange={(value) => setIsExpanded(!!value)}
                >
                  <AccordionItem value="context" className="border-0">
                    <div className="space-y-2">
                      <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed wrap-break-word">
                        {!isExpanded && previewText}
                      </div>
                      <AccordionTrigger className="py-2 hover:no-underline text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                        {isExpanded ? 'Show less' : 'Show full context'}
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
                        <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed wrap-break-word whitespace-pre-wrap pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60">
                          {responseText}
                        </div>
                      </AccordionContent>
                    </div>
                  </AccordionItem>
                </Accordion>
              ) : (
                <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed wrap-break-word whitespace-pre-wrap">
                  {responseText}
                </div>
              )}

              {/* Footer metadata */}
              {result?.searchTime && (
                <div className="flex items-center gap-2 pt-2 border-t border-neutral-200/30 dark:border-neutral-700/30">
                  <Clock className="w-3 h-3 text-neutral-400" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Search completed in {(result.searchTime / 1000).toFixed(2)}s
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
