import { useMemo, useState } from 'react';
import type { DynamicToolUIPart, ReasoningUIPart } from 'ai';

import { useDataStream } from '@/components/data-stream-provider';
import { MarkdownRenderer } from '@/components/markdown';
import { useMessageActions } from '@/contexts/message-actions-context';
import type { ChatMessage } from '@/lib/types';

import { getPendingInlineElicitations } from './mcp';
import { cleanModelText, getMcpTimelineRange, joinReasoningChunks, mergeReasoningStates } from './part-helpers';
import { DynamicToolInvocationCard, DynamicToolStepper, type McpTimelineEntry } from './tools';

type MessagePart = ChatMessage['parts'][number];

// The steps an MCP timeline shows, from its range of parts: each MCP call, the
// reasoning between calls merged per block, and the text written between two calls.
function buildMcpTimeline(
  parts: MessagePart[],
  range: NonNullable<ReturnType<typeof getMcpTimelineRange>>,
  messageIndex: number,
): McpTimelineEntry[] {
  const entries: McpTimelineEntry[] = [];
  let cursor = range.start;
  while (cursor <= range.end) {
    const current = parts[cursor];

    if (current?.type === 'dynamic-tool' && current.toolName.startsWith('mcp_')) {
      entries.push({
        kind: 'tool',
        part: current,
        originalIndex: cursor,
        id: current.toolCallId || `mcp-tool-${messageIndex}-${cursor}`,
      });
      cursor += 1;
    } else if (current?.type === 'reasoning') {
      const blockStart = cursor;
      const texts: string[] = [];
      const states: Array<ReasoningUIPart['state']> = [];
      while (cursor <= range.end && parts[cursor]?.type === 'reasoning') {
        const reasoning = parts[cursor] as ReasoningUIPart;
        if (reasoning.text) texts.push(reasoning.text);
        if (reasoning.state) states.push(reasoning.state);
        cursor += 1;
      }
      if (texts.length > 0) {
        entries.push({
          kind: 'reasoning',
          text: joinReasoningChunks(texts),
          state: mergeReasoningStates(states),
          id: `mcp-reasoning-${messageIndex}-${blockStart}`,
        });
      }
    } else if (current?.type === 'text') {
      const blockStart = cursor;
      const chunks: string[] = [];
      while (cursor <= range.end && parts[cursor]?.type === 'text') {
        const cleaned = cleanModelText((parts[cursor] as { text?: string }).text ?? '').trim();
        if (cleaned) chunks.push(cleaned);
        cursor += 1;
      }
      const isBetweenTools = blockStart > range.firstTool && blockStart < range.lastTool;
      if (isBetweenTools && chunks.length > 0) {
        entries.push({ kind: 'text', text: chunks.join('\n\n'), id: `mcp-text-${messageIndex}-${blockStart}` });
      }
    } else {
      cursor += 1;
    }
  }
  return entries;
}

function TimelineText({ text, wrap }: { text: string; wrap?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden bg-card/30 mt-1">
      <div
        className={`px-3.5 py-2.5 text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap${wrap ? ' wrap-break-word' : ''}`}
      >
        <MarkdownRenderer content={text} />
      </div>
    </div>
  );
}

// A dynamic tool call. A message's MCP calls render as one timeline, from the first
// call; its other dynamic calls render as one stepper, from the first of them.
export function DynamicToolPart({
  part,
  parts,
  partIndex,
  messageIndex,
}: {
  part: DynamicToolUIPart;
  parts: MessagePart[];
  partIndex: number;
  messageIndex: number;
}) {
  const { sendMessage } = useMessageActions();
  const { dataStream } = useDataStream();
  // Elicitations answered inline are hidden right away, before the stream says so.
  const [answeredElicitationIds, setAnsweredElicitationIds] = useState<Set<string>>(() => new Set());
  const inlineElicitations = useMemo(
    () => getPendingInlineElicitations(dataStream ?? [], answeredElicitationIds),
    [dataStream, answeredElicitationIds],
  );

  const mcpRange = getMcpTimelineRange(parts);
  if (mcpRange) {
    if (!part.toolName.startsWith('mcp_')) return <DynamicToolInvocationCard part={part} />;
    if (partIndex !== mcpRange.firstTool) return null;

    const entries = buildMcpTimeline(parts, mcpRange, messageIndex);
    if (entries.length > 1 || inlineElicitations.length > 0) {
      return (
        <DynamicToolStepper
          entries={entries}
          messageIndex={messageIndex}
          startIndex={partIndex}
          sendMessage={sendMessage}
          inlineElicitations={inlineElicitations}
          onInlineElicitationResolved={(elicitationId) =>
            setAnsweredElicitationIds((prev) => new Set(prev).add(elicitationId))
          }
        />
      );
    }
    const [onlyEntry] = entries;
    if (onlyEntry?.kind === 'tool')
      return <DynamicToolInvocationCard part={onlyEntry.part} sendMessage={sendMessage} />;
    if (onlyEntry?.kind === 'reasoning') return <TimelineText text={onlyEntry.text} />;
    if (onlyEntry?.kind === 'text') return <TimelineText text={onlyEntry.text} wrap />;
  }

  const firstDynamicToolIndex = parts.findIndex((p) => p.type === 'dynamic-tool');
  if (partIndex !== firstDynamicToolIndex) return null;

  const entries = parts.flatMap((p, index): McpTimelineEntry[] =>
    p.type === 'dynamic-tool'
      ? [{ kind: 'tool', part: p, originalIndex: index, id: p.toolCallId || `dynamic-tool-${messageIndex}-${index}` }]
      : [],
  );
  if (entries.length > 1) {
    return (
      <DynamicToolStepper
        entries={entries}
        messageIndex={messageIndex}
        startIndex={partIndex}
        sendMessage={sendMessage}
      />
    );
  }
  return <DynamicToolInvocationCard part={part} sendMessage={sendMessage} />;
}
