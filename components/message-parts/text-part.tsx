import { useMemo } from 'react';
import { SPEC_DATA_PART_TYPE } from '@json-render/core';

import { ChatTextHighlighter } from '@/components/chat-text-highlighter';
import { MarkdownRenderer } from '@/components/markdown';
import { StreamingIndicator } from '@/components/streaming-indicator';
import { useMessageActions } from '@/contexts/message-actions-context';
import { useModels } from '@/hooks/use-models';
import type { ChatMessage } from '@/lib/types';
import type { ComprehensiveUserData } from '@/lib/user-data-server';

import { buildSourceItems, MessageSources } from './message-sources';
import { cleanModelText } from './part-helpers';
import { ResponseActions } from './response-actions';
import { ResponseInfo } from './response-info';
import { isSourcePartType, isToolPartType } from './shared';
import { TextPartEditor, useTextPartEdit } from './text-edit';
import { CanvasSpecRenderer } from './tools';

type MessagePart = ChatMessage['parts'][number];

// Images a generate_image or edit_image card of this message already shows: if the model
// repeats one in its text, the text shows a download chip instead of the image again.
function getGeneratedImageUrls(parts: MessagePart[]): Set<string> {
  return new Set(
    parts.flatMap((p) => {
      if (p.type !== 'tool-generate_image' && p.type !== 'tool-edit_image') return [];
      const tool = p as { state?: string; output?: { success?: boolean; imageUrl?: string } };
      return tool.state === 'output-available' && tool.output?.success && tool.output.imageUrl
        ? [tool.output.imageUrl]
        : [];
    }),
  );
}

export function TextPart({
  text,
  message,
  messageIndex,
  partIndex,
  status,
  hasActiveToolInvocations,
  isLastMessage,
  canEdit,
  isHermesChat,
  user,
  isOwner,
  chatId,
  selectedVisibilityType,
}: {
  text: string;
  message: ChatMessage;
  messageIndex: number;
  partIndex: number;
  status: string;
  hasActiveToolInvocations: boolean;
  isLastMessage: boolean;
  canEdit: boolean;
  isHermesChat: boolean;
  user?: ComprehensiveUserData;
  isOwner?: boolean;
  chatId?: string;
  selectedVisibilityType?: 'public' | 'private';
}) {
  const parts = message.parts;
  const { onHighlight } = useMessageActions();
  const { getModel } = useModels();
  const edit = useTextPartEdit({ message, partIndex, isSignedIn: !!user, failureTitle: 'Failed to save edit' });
  const sourceItems = useMemo(() => buildSourceItems(parts, messageIndex), [parts, messageIndex]);
  const generatedImageUrls = useMemo(() => getGeneratedImageUrls(parts), [parts]);

  const isStreaming = status === 'streaming' || status === 'submitted';
  if (!text.trim()) {
    // The empty text a turn starts with shows the loader, unless tools or reasoning
    // already show progress.
    if (isStreaming && !hasActiveToolInvocations && !parts.some((p) => p.type === 'reasoning')) {
      return (
        <div className="flex flex-col min-h-[calc(100vh-18rem)] m-0! p-0! mt-4!">
          <StreamingIndicator />
        </div>
      );
    }
    return status === 'streaming' && hasActiveToolInvocations ? <div /> : null;
  }

  // Some models end a tool turn with a lone end-of-turn token.
  const followsToolOrSource = parts.slice(0, partIndex).some((p) => isToolPartType(p.type) || isSourcePartType(p.type));
  if (followsToolOrSource && text.trim() === '<|im_end|>') return null;

  const cleanText = cleanModelText(text);
  const isLastAssistantMessage = isLastMessage && message.role === 'assistant';
  // A tool loop writes one text part per step; the answer's actions go under the last one.
  const isLastTextPart = partIndex === parts.findLastIndex((p) => p.type === 'text');
  // Not while the answer is still coming. 'error' counts as done, so an answer cut by a
  // stream failure can still be retried or deleted.
  const showActions = isLastTextPart && (status === 'ready' || status === 'error' || !isLastAssistantMessage);
  const hasCanvasSpec = isLastTextPart && parts.some((p) => p.type === SPEC_DATA_PART_TYPE);
  const modelLabel = message.metadata?.model
    ? (getModel(message.metadata.model)?.label ?? message.metadata.model)
    : null;

  return (
    <div className="mt-2">
      {edit.isEditing ? (
        <div className="w-full rounded-2xl border border-border bg-accent/80 px-4 py-3">
          <TextPartEditor
            edit={edit}
            original={cleanText}
            textareaClassName="prose prose-sm sm:prose-base prose-neutral dark:prose-invert font-sans font-normal max-w-none text-base! text-foreground dark:text-foreground w-full resize-none border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0! outline-none min-h-[120px] bg-transparent!"
          />
        </div>
      ) : (
        <ChatTextHighlighter onHighlight={onHighlight} removeHighlightOnClick={true}>
          <MarkdownRenderer content={cleanText} generatedImageUrls={generatedImageUrls} />
        </ChatTextHighlighter>
      )}

      {!edit.isEditing && hasCanvasSpec && <CanvasSpecRenderer parts={parts} isStreaming={status === 'streaming'} />}

      {/* An Agent message is a relayed update, not a native answer: editing, retrying,
          branching or exporting it would do nothing useful. */}
      {showActions && !edit.isEditing && !isHermesChat && (
        <div className="flex items-center justify-between mt-3 mb-4">
          <ResponseActions
            message={message}
            text={cleanText}
            modelLabel={modelLabel}
            canEdit={canEdit}
            isLastAssistantMessage={isLastAssistantMessage}
            onEdit={() => edit.start(cleanText)}
            user={user}
            isOwner={isOwner}
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
          />
          <div className="flex items-center gap-1.5">
            {sourceItems.length > 0 && <MessageSources sources={sourceItems} />}
            <ResponseInfo message={message} modelLabel={modelLabel} />
          </div>
        </div>
      )}
    </div>
  );
}
