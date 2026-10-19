import { useState } from 'react';
import type { ReasoningUIPart } from 'ai';
import { sileo } from 'sileo';

import { ReasoningPartView } from '@/components/reasoning-part';
import type { ChatMessage } from '@/lib/types';

import { getMcpTimelineRange, joinReasoningChunks, mergeReasoningStates } from './part-helpers';
import { formatDynamicToolName, isToolPartType } from './shared';
import { usePersistMessageParts } from './use-persist-message-parts';

type MessagePart = ChatMessage['parts'][number];

export interface ReasoningDisplayState {
  visibilityMap: Record<string, boolean>;
  fullscreenMap: Record<string, boolean>;
  setVisibilityMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setFullscreenMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

// The name of the first tool the turn called, shown next to the reasoning it ran beside.
function getParallelToolName(parts: MessagePart[]): string | null {
  const firstToolPart = parts.find((p) => isToolPartType(p.type));
  if (!firstToolPart) return null;
  if (firstToolPart.type === 'dynamic-tool') return formatDynamicToolName('dynamic-tool', firstToolPart.toolName);
  return firstToolPart.type.split('-')[1] ?? null;
}

// A block of reasoning: consecutive reasoning parts render as one, from the first of
// them. Reasoning inside an MCP timeline is shown by the timeline instead.
export function ReasoningMessagePart({
  part,
  parts,
  partIndex,
  messageIndex,
  message,
  canEdit,
  isSignedIn,
  display,
}: {
  part: ReasoningUIPart;
  parts: MessagePart[];
  partIndex: number;
  messageIndex: number;
  message: ChatMessage;
  canEdit: boolean;
  isSignedIn: boolean;
  display: ReasoningDisplayState;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const persistMessageParts = usePersistMessageParts(message.id, isSignedIn);

  const mcpRange = getMcpTimelineRange(parts);
  if (mcpRange && partIndex >= mcpRange.start && partIndex <= mcpRange.end) return null;
  if (parts[partIndex - 1]?.type === 'reasoning') return null;

  let blockEnd = partIndex;
  const texts: string[] = [];
  const states: Array<ReasoningUIPart['state']> = [];
  while (blockEnd < parts.length && parts[blockEnd]?.type === 'reasoning') {
    const reasoning = parts[blockEnd] as ReasoningUIPart;
    if (reasoning.text) texts.push(reasoning.text);
    if (reasoning.state) states.push(reasoning.state);
    blockEnd += 1;
  }
  const mergedText = joinReasoningChunks(texts);
  const mergedState = mergeReasoningStates(states);
  const mergedPart: ReasoningUIPart = { ...part, text: mergedText, state: mergedState };

  const sectionKey = `${messageIndex}-${partIndex}`;
  // 1-based position of this block among the turn's reasoning blocks.
  const reasoningIndex = parts
    .slice(0, partIndex + 1)
    .filter((p, i, arr) => p.type === 'reasoning' && arr[i - 1]?.type !== 'reasoning').length;
  const hasFollowingOutput = parts.some((p, i) => i > partIndex && (p.type === 'text' || isToolPartType(p.type)));
  // Done when the part says so, or, without a state, once output followed it.
  const isComplete = mergedState === 'done' || (mergedState == null && hasFollowingOutput);

  // Open while streaming and closed once done, unless the reader toggled it.
  const setIsExpanded = (v: boolean) => display.setVisibilityMap((prev) => ({ ...prev, [sectionKey]: v }));
  const setIsFullscreen = (v: boolean) => display.setFullscreenMap((prev) => ({ ...prev, [sectionKey]: v }));

  const save = async () => {
    try {
      setIsSaving(true);
      const updatedPart = { ...part, text: draft, state: 'done' } as MessagePart;
      await persistMessageParts([...parts.slice(0, partIndex), updatedPart, ...parts.slice(blockEnd)]);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving edited reasoning:', error);
      sileo.error({ title: 'Failed to save edit' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ReasoningPartView
      part={mergedPart}
      sectionKey={sectionKey}
      reasoningIndex={reasoningIndex}
      parallelTool={getParallelToolName(parts)}
      isComplete={isComplete}
      expandedOverride={display.visibilityMap[sectionKey]}
      isFullscreen={display.fullscreenMap[sectionKey] ?? false}
      setIsExpanded={setIsExpanded}
      setIsFullscreen={setIsFullscreen}
      // Nothing is settled to edit while it streams.
      canEdit={canEdit && mergedState !== 'streaming'}
      isEditing={isEditing}
      isSaving={isSaving}
      editDraft={draft}
      onEditDraftChange={setDraft}
      onStartEdit={() => {
        setDraft(mergedText);
        setIsEditing(true);
        setIsExpanded(true);
      }}
      onCancelEdit={() => setIsEditing(false)}
      onSaveEdit={save}
    />
  );
}
