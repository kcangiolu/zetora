import { memo, useMemo } from 'react';
import type { DataUIPart, ReasoningUIPart } from 'ai';
import { SPEC_DATA_PART_TYPE } from '@json-render/core';

import type { ChatMessage, CustomUIDataTypes, HermesMediaData, HermesPromptData } from '@/lib/types';
import type { ComprehensiveUserData } from '@/lib/user-data-server';

import { CompactionSummaryPart } from './compaction-summary-part';
import { DynamicToolPart } from './dynamic-tool-part';
import { HermesMediaCard } from './hermes-media';
import { HermesPromptCard } from './hermes-prompt';
import { ReasoningMessagePart } from './reasoning-message-part';
import { StaticToolPart } from './static-tool-part';
import { TextPart } from './text-part';

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
  // Whether this part's message is the last one in the list.
  isLastMessage: boolean;
  user?: ComprehensiveUserData;
  isOwner?: boolean;
  selectedVisibilityType?: 'public' | 'private';
  chatId?: string;
  hiddenImageUrls?: Set<string>;
}

// Renders one part of a message by its type.
export const MessagePartRenderer = memo<MessagePartRendererProps>(function MessagePartRenderer({
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
  isLastMessage,
  user,
  isOwner,
  selectedVisibilityType,
  chatId,
  hiddenImageUrls,
}) {
  const annotations = useMemo(
    () => message.parts.filter((p) => p.type.startsWith('data-')) as DataUIPart<CustomUIDataTypes>[],
    [message.parts],
  );
  // The owner, or anyone on a private chat opened without an account.
  const canEdit = Boolean((user && isOwner) || (!user && selectedVisibilityType === 'private'));

  switch (part.type) {
    case 'text':
      if (message.metadata?.isCompactionSummary) {
        return (
          <CompactionSummaryPart
            text={part.text}
            message={message}
            partIndex={partIndex}
            canEdit={canEdit}
            isSignedIn={!!user}
          />
        );
      }
      return (
        <TextPart
          text={part.text}
          message={message}
          messageIndex={messageIndex}
          partIndex={partIndex}
          status={status}
          hasActiveToolInvocations={hasActiveToolInvocations}
          isLastMessage={isLastMessage}
          canEdit={canEdit}
          user={user}
          isOwner={isOwner}
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
        />
      );

    case 'reasoning':
      return (
        <ReasoningMessagePart
          part={part as ReasoningUIPart}
          parts={parts}
          partIndex={partIndex}
          messageIndex={messageIndex}
          message={message}
          canEdit={canEdit}
          isSignedIn={!!user}
          display={{
            visibilityMap: reasoningVisibilityMap,
            fullscreenMap: reasoningFullscreenMap,
            setVisibilityMap: setReasoningVisibilityMap,
            setFullscreenMap: setReasoningFullscreenMap,
          }}
        />
      );

    // Gaps between steps; only the first one leaves some room.
    case 'step-start':
      return partIndex === parts.findIndex((p) => p.type === 'step-start') ? <div className="p-0 py-1.5" /> : null;

    // Shown elsewhere: canvas specs after the text, sources under the answer.
    case SPEC_DATA_PART_TYPE:
    case 'source-url':
      return null;

    case 'data-hermes_prompt':
      return chatId ? <HermesPromptCard chatId={chatId} prompt={(part as { data: HermesPromptData }).data} /> : null;

    case 'data-hermes_media':
      return <HermesMediaCard media={(part as { data: HermesMediaData }).data} />;

    case 'dynamic-tool':
      return <DynamicToolPart part={part} parts={parts} partIndex={partIndex} messageIndex={messageIndex} />;

    default:
      return (
        <StaticToolPart
          part={part}
          annotations={annotations}
          canEdit={canEdit}
          chatId={chatId}
          hiddenImageUrls={hiddenImageUrls}
        />
      );
  }
});
