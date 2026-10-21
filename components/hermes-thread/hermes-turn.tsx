'use client';

import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { AttachmentsBadge } from '@/components/message';
import { MarkdownRenderer } from '@/components/markdown';
import { ChatTextHighlighter } from '@/components/chat-text-highlighter';
import { HermesModeDot } from '@/components/ui/hermes-mode-dot';
import { cleanModelText } from '@/components/message-parts/part-helpers';
import { useMessageActions } from '@/contexts/message-actions-context';
import { getFileAttachments } from '@/lib/file-attachments';
import { formatStepDuration, summarizeHermesSteps, type HermesTurn as HermesTurnData } from '@/lib/hermes/thread';
import type { Attachment, ChatMessage } from '@/lib/types';
import { HermesBubble, type HermesBubbleAction } from './hermes-bubble';
import { HermesToolStep } from './hermes-tool-step';

export type RenderHermesPart = (
  part: ChatMessage['parts'][number],
  message: ChatMessage,
  partIndex: number,
) => ReactNode;

// Taller than this, a user message is folded behind "Show more".
const USER_MESSAGE_MAX_HEIGHT = 125;

function formatTime(iso: string | undefined): string | null {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
}

function UserMessageContent({
  message,
  attachmentsRenderer,
}: {
  message: ChatMessage;
  attachmentsRenderer?: (attachments: Attachment[]) => ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isFoldable, setIsFoldable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const text = message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
  const attachments = getFileAttachments(message.parts);

  useLayoutEffect(() => {
    if (contentRef.current) setIsFoldable(contentRef.current.scrollHeight > USER_MESSAGE_MAX_HEIGHT);
  }, [text]);

  return (
    <>
      <div
        ref={contentRef}
        className={isFoldable && !isExpanded ? 'max-h-[125px] overflow-hidden mask-b-from-60%' : undefined}
      >
        {text && <MarkdownRenderer content={text} isUserMessage />}
        {attachments.length > 0 && (
          <div className={text ? 'mt-2' : undefined}>
            {attachmentsRenderer ? attachmentsRenderer(attachments) : <AttachmentsBadge attachments={attachments} />}
          </div>
        )}
      </div>
      {isFoldable && (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? 'Show less' : 'Show more'}
          {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      )}
    </>
  );
}

function AgentMessageContent({ message, renderPart }: { message: ChatMessage; renderPart: RenderHermesPart }) {
  const { onHighlight } = useMessageActions();
  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, partIndex) =>
        part.type === 'text' ? (
          part.text.trim() && (
            <ChatTextHighlighter key={partIndex} onHighlight={onHighlight} removeHighlightOnClick>
              <MarkdownRenderer content={cleanModelText(part.text)} />
            </ChatTextHighlighter>
          )
        ) : (
          <div key={partIndex}>{renderPart(part, message, partIndex)}</div>
        ),
      )}
    </div>
  );
}

// One exchange of an Agent conversation: the user's message, then the agent's replies
// with the tool steps that led to them. While the turn runs, steps show in place between
// the replies; once it is done they fold into one "Hermes task complete" line.
export const HermesTurn = memo(function HermesTurn({
  turn,
  isLive,
  reaction,
  selectedMessageId,
  onSelectMessage,
  actionsFor,
  renderPart,
  attachmentsRenderer,
}: {
  turn: HermesTurnData;
  isLive: boolean;
  // Hermes's ack on the user message (👀 seen, then ✅ or ❌).
  reaction: string | null;
  selectedMessageId: string | null;
  onSelectMessage: (messageId: string | null) => void;
  actionsFor: (message: ChatMessage) => HermesBubbleAction[];
  renderPart: RenderHermesPart;
  attachmentsRenderer?: (attachments: Attachment[]) => ReactNode;
}) {
  const [isTaskExpanded, setIsTaskExpanded] = useState(false);
  const summary = summarizeHermesSteps(turn.steps);
  const firstAgentMessage = turn.entries.find((entry) => entry.kind === 'message');
  const startedAt =
    firstAgentMessage?.kind === 'message'
      ? firstAgentMessage.message.metadata?.createdAt
      : turn.entries[0]?.kind === 'step'
        ? turn.entries[0].step.startedAt
        : undefined;

  const bubble = (message: ChatMessage, from: 'user' | 'agent', content: ReactNode) => (
    <HermesBubble
      key={message.id}
      from={from}
      label={from === 'user' ? 'Your message' : 'Hermes message'}
      selected={selectedMessageId === message.id}
      onSelectedChange={(selected) => onSelectMessage(selected ? message.id : null)}
      actions={actionsFor(message)}
    >
      {content}
    </HermesBubble>
  );

  return (
    <div className="flex flex-col gap-1.5 pb-6">
      {turn.userMessage && (
        <div className="flex flex-col items-end gap-1">
          {bubble(
            turn.userMessage,
            'user',
            <UserMessageContent message={turn.userMessage} attachmentsRenderer={attachmentsRenderer} />,
          )}
          {reaction && (
            <span className="text-sm leading-none" aria-label={`Hermes reacted: ${reaction}`}>
              {reaction}
            </span>
          )}
        </div>
      )}

      {turn.entries.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
            <HermesModeDot />
            <span className="font-medium text-foreground">Hermes</span>
            {formatTime(startedAt) && <span>{formatTime(startedAt)}</span>}
          </div>

          {isLive ? (
            turn.entries.map((entry) =>
              entry.kind === 'step' ? (
                <div key={entry.step.toolCallId} className="px-1">
                  <HermesToolStep step={entry.step} />
                </div>
              ) : (
                bubble(entry.message, 'agent', <AgentMessageContent message={entry.message} renderPart={renderPart} />)
              ),
            )
          ) : (
            <>
              {summary.count > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={isTaskExpanded}
                    onClick={() => setIsTaskExpanded((expanded) => !expanded)}
                    className="flex items-center gap-1.5 self-start px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <CheckCircle2 className="size-3.5 text-primary/80" aria-hidden="true" />
                    <span>Hermes task complete</span>
                    <span className="font-normal text-muted-foreground/80">
                      · {summary.count} {summary.count === 1 ? 'step' : 'steps'}
                      {summary.failed > 0 && ` · ${summary.failed} failed`}
                      {summary.durationMs !== null && ` · ${formatStepDuration(summary.durationMs)}`}
                    </span>
                    {isTaskExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                  {isTaskExpanded && (
                    <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card/60 px-3">
                      {turn.steps.map((step) => (
                        <HermesToolStep key={step.toolCallId} step={step} detailed />
                      ))}
                    </div>
                  )}
                </>
              )}
              {turn.entries.map(
                (entry) =>
                  entry.kind === 'message' &&
                  bubble(
                    entry.message,
                    'agent',
                    <AgentMessageContent message={entry.message} renderPart={renderPart} />,
                  ),
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
