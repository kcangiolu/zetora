import React, { memo, useMemo, useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import { Virtuoso, VirtuosoHandle, type Components } from 'react-virtuoso';
import { Message, DELIVERABLE_TOOL_PART_TYPES, type MessageEditDraft } from '@/components/message';
import { isToolUIPart } from 'ai';
import { EnhancedErrorDisplay } from '@/components/message';
import { MessagePartRenderer } from '@/components/message-parts';
import { MarkdownRenderer } from '@/components/markdown';
import { StreamingIndicator } from '@/components/streaming-indicator';
import { Attachment, ChatMessage } from '@/lib/types';
import { MessageActionsProvider, type MessageActions } from '@/contexts/message-actions-context';
import { UseChatHelpers } from '@ai-sdk/react';
import { ComprehensiveUserData } from '@/lib/user-data-server';
import { cn } from '@/lib/utils';
import { useTurnActions } from '@/hooks/use-turn-actions';

// react-virtuoso logs "Zero-sized element" as an ERROR, its lowest prop-settable
// level, for an assistant row that has no token yet. The row grows once content
// streams in, so silence it through virtuoso's own global switch.
if (typeof window !== 'undefined') {
  (window as unknown as { VIRTUOSO_LOG_LEVEL?: number }).VIRTUOSO_LOG_LEVEL = 4;
}

interface MessagesProps {
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  stop: UseChatHelpers<ChatMessage>['stop'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  suggestedQuestions: string[];
  setSuggestedQuestions: (questions: string[]) => void;
  status: UseChatHelpers<ChatMessage>['status'];
  error: Error | null; // Add error from useChat
  user?: ComprehensiveUserData | null; // Add user prop
  selectedVisibilityType?: 'public' | 'private'; // Add visibility type
  chatId?: string; // Add chatId prop
  onVisibilityChange?: (visibility: 'public' | 'private') => void; // Add visibility change handler
  isOwner?: boolean; // Add ownership prop
  hiddenImageUrls?: Set<string>;
  onToggleImageHidden?: (imageUrl: string, hidden: boolean) => void;
  onHighlight?: (text: string) => void; // Add highlight handler
  attachmentsRenderer?: (attachments: Attachment[]) => React.ReactNode;
  isTransitioning?: boolean;
  onBeforeSubmit?: () => void;
  skipCacheRef?: React.MutableRefObject<boolean>;
  // Regenerate/retry (below) always calls useChat's own regenerate(), which
  // always targets /api/search — there is no Hermes-aware variant of it. A
  // Hermes-mode chat never goes through /api/search at all, so calling it
  // there would silently run a real LLM turn instead of anything Hermes.
  // Gate it off entirely rather than build a parallel "resend to Hermes"
  // regenerate — Hermes already has its own native retry (the `/retry` slash
  // command, see lib/hermes/commands.ts).
  isHermesChat?: boolean;
  // Current Hermes `typing` heartbeat's status phrase (or a generic fallback), null when
  // none is active — drives the same loading indicator a streaming LLM turn shows, since
  // Hermes has no LLM-turn status of its own to derive shouldShowLoading from.
  hermesTypingLabel?: string | null;
  // The agent's reply as it is being written (Hermes's `draft` op), null when no stream is
  // open. Rendered in the Footer rather than as a message: it is never persisted, and the
  // real message arrives separately once the segment is complete.
  hermesDraft?: string | null;
  // Hermes's best-effort `react` acks (👀 seen → ✅/❌ done) on the user's own messages,
  // keyed by message id — see chat-interface.tsx's onReaction wiring.
  hermesReactions?: Record<string, string | null>;
  // Reserved space below the message list to clear whatever bottom bar sits over it.
  // Defaults to the height of the main chat composer; callers with a shorter bottom
  // bar (e.g. the read-only share page) should override it.
  bottomSpacerClassName?: string;
  // Fires whenever Virtuoso's own internal scroller crosses the at-bottom threshold —
  // this is the source of truth for "at bottom", since Virtuoso owns its own scroll
  // container and the outer page/window scroll doesn't move when it's virtualized.
  onAtBottomChange?: (atBottom: boolean) => void;
}

export interface MessagesHandle {
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
}

interface MessagesFooterContext {
  isHermesChat: boolean;
  hermesDraft: string | null;
  hermesTypingLabel: string | null;
  shouldShowLoading: boolean;
  shouldReserveLoaderMinHeight: boolean;
  // Set only when there is no assistant message to show the error itself.
  error: Error | null;
  user?: ComprehensiveUserData | null;
  isOwner?: boolean;
  selectedVisibilityType: 'public' | 'private';
  handleRetry: () => Promise<void>;
  handleDelete: () => Promise<void>;
}

// Declared once at module level and fed through Virtuoso's `context`: a Footer component
// created inside MessagesImpl would be a new component type on every change, and React
// would unmount and remount the whole footer (restarting the loader's animation) each time.
function MessagesFooter({ context }: { context: MessagesFooterContext }) {
  const {
    isHermesChat,
    hermesDraft,
    hermesTypingLabel,
    shouldShowLoading,
    shouldReserveLoaderMinHeight,
    error,
    user,
    isOwner,
    selectedVisibilityType,
    handleRetry,
    handleDelete,
  } = context;
  return (
    <>
      {/* The agent's reply while it is still being written (Hermes's `draft` op). It lives
          here instead of in the message list because it is never persisted: the completed
          segment arrives separately as its own message, and the draft is cleared the
          moment it does. Same MarkdownRenderer as a real assistant text part, so the
          handoff from draft to message is seamless rather than a visible reflow. */}
      {isHermesChat && hermesDraft && (
        <div className="mt-2">
          <MarkdownRenderer content={hermesDraft} />
        </div>
      )}

      {/* Loading animation when status is submitted or streaming with minimal assistant content */}
      {shouldShowLoading && (
        <div
          className={`flex items-start ${shouldReserveLoaderMinHeight ? 'min-h-[calc(100vh-18rem)]' : ''} m-0! p-0!`}
        >
          <div className="w-full m-0! p-0!">
            <StreamingIndicator label={isHermesChat ? (hermesTypingLabel ?? undefined) : undefined} />
          </div>
        </div>
      )}

      {error && (
        <EnhancedErrorDisplay
          error={error}
          user={user ?? undefined}
          isOwner={isOwner}
          selectedVisibilityType={selectedVisibilityType}
          handleRetry={handleRetry}
          handleDelete={handleDelete}
        />
      )}
    </>
  );
}

const VIRTUOSO_COMPONENTS: Components<ChatMessage, MessagesFooterContext> = { Footer: MessagesFooter };

// Shared by every message but the last, so their memoized props stay equal.
const NO_SUGGESTED_QUESTIONS: string[] = [];

const MessagesImpl = React.forwardRef<MessagesHandle, MessagesProps>(function MessagesImpl(
  {
    messages,
    setMessages,
    suggestedQuestions,
    setSuggestedQuestions,
    status,
    error,
    user,
    selectedVisibilityType = 'private',
    chatId,
    onVisibilityChange,
    isOwner,
    hiddenImageUrls,
    onToggleImageHidden,
    onHighlight,
    attachmentsRenderer,
    sendMessage,
    regenerate,
    stop,
    isTransitioning,
    onBeforeSubmit,
    skipCacheRef,
    bottomSpacerClassName = 'mb-38! sm:mb-42!',
    onAtBottomChange,
    isHermesChat = false,
    hermesTypingLabel = null,
    hermesDraft = null,
    hermesReactions,
  },
  ref,
) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Track visibility state for each reasoning section using messageIndex-partIndex as key
  const [reasoningVisibilityMap, setReasoningVisibilityMap] = useState<Record<string, boolean>>({});
  const [reasoningFullscreenMap, setReasoningFullscreenMap] = useState<Record<string, boolean>>({});
  // The message being edited and its draft are held here, not inside Message:
  // Virtuoso unmounts items it considers off-screen (a large paste growing the
  // editor past the viewport is enough), which would otherwise close the editor
  // and discard the draft.
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MessageEditDraft | null>(null);
  const handleEditingChange = useCallback((messageId: string | null) => {
    setEditDraft(null);
    setEditingMessageId(messageId);
  }, []);

  // Actions read the list when they run instead of closing over it: the list changes
  // on every streamed chunk, and depending on it would re-render every message.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const getMessages = useCallback(() => messagesRef.current, []);

  // Filter messages to only show the ones we want to display
  const memoizedMessages = useMemo(() => {
    return messages.filter((message) => message.role === 'user' || message.role === 'assistant');
  }, [messages]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: (behavior = 'smooth') => {
        virtuosoRef.current?.scrollToIndex({
          index: memoizedMessages.length - 1,
          align: 'end',
          behavior,
        });
      },
    }),
    [memoizedMessages.length],
  );

  // Check if there are any active tool invocations in the current messages
  const hasActiveToolInvocations = useMemo(() => {
    const lastMessage = memoizedMessages[memoizedMessages.length - 1];

    // Only consider tools as "active" if we're currently streaming AND the last message is assistant with tools
    if (status === 'streaming' && lastMessage?.role === 'assistant') {
      return lastMessage.parts?.some((part: ChatMessage['parts'][number]) => isToolUIPart(part));
    }
    return false;
  }, [memoizedMessages, status]);

  // Compute the index of the message that is missing an assistant response.
  // This is scoped to the last message in the conversation only, so older chats
  // do not incorrectly show the "No response generated" block.
  const missingAssistantResponseIndex = useMemo(() => {
    const lastIndex = memoizedMessages.length - 1;
    const lastMessage = memoizedMessages[lastIndex];

    // Case 1: Last message is user and no assistant response yet. Meaningless in Hermes
    // mode: useChat's own status never leaves 'ready' for a Hermes turn (the outbound
    // send is a plain fetch, not useChat's sendMessage — see hooks/use-hermes-send.ts),
    // so this would fire the instant the user's message is appended, even though the
    // agent's reply (arriving async over the SSE channel) just hasn't landed yet.
    if (!isHermesChat && lastMessage?.role === 'user' && status === 'ready' && !error) {
      return lastIndex;
    }

    // Case 2: Last message is assistant but lacks visible content
    // Also covers status === 'error': a stream that fails outright (not a clean manual
    // stop) still leaves an assistant message behind, which should get the same
    // "missing response" fallback (and its Delete button) instead of being stuck with
    // only an Edit button on the preceding user message.
    if (lastMessage?.role === 'assistant' && (status === 'ready' || status === 'error')) {
      const parts = lastMessage.parts || [];

      const hasVisibleText = parts.some(
        (part: ChatMessage['parts'][number]) => part.type === 'text' && part.text && part.text.trim() !== '',
      );
      // Only a tool call whose output IS the deliverable (generated image,
      // edited image, downloaded file) counts as a response on its own — an
      // internal research/utility step (web_search, retrieve, code
      // interpreter...) resolving successfully is not itself an answer to
      // the user. Without this narrowing, a turn that reasons, calls
      // web_search, then gets cut off before ever writing a reply reads as
      // "has visible content" and never offers Delete/Retry/Resume.
      const hasDeliverableToolOutput = parts.some((part: ChatMessage['parts'][number]) => {
        if (!isToolUIPart(part) || !DELIVERABLE_TOOL_PART_TYPES.has(part.type)) return false;
        const anyPart = part as unknown as { state?: string; output?: { success?: boolean } };
        return anyPart.state === 'output-available' && anyPart.output?.success !== false;
      });
      // A Hermes send_media action with no caption (agent-event/route.ts's `caption:
      // action.content || null`) produces a message whose ONLY part is
      // data-hermes_media — no sibling text part like every other Hermes action always
      // includes. Confirmed against a real production message: a voice reply with no
      // caption was flagged "missing" even though its player rendered fine right above
      // the false banner. hermes_prompt already always ships a text part alongside it,
      // so this is belt-and-suspenders for that one, load-bearing for media.
      const hasHermesContent = parts.some(
        (part: ChatMessage['parts'][number]) => part.type === 'data-hermes_media' || part.type === 'data-hermes_prompt',
      );
      const hasVisibleContent = hasVisibleText || hasDeliverableToolOutput || hasHermesContent;

      // If there is no visible content at all, consider the response missing
      if (!hasVisibleContent) {
        return lastIndex;
      }
    }

    return -1;
  }, [memoizedMessages, status, error, isHermesChat]);

  const { retryLastTurn: handleRetry, deleteLastTurn: handleDelete } = useTurnActions({
    getMessages,
    setMessages,
    setSuggestedQuestions,
    regenerate,
    stop,
    isSignedIn: Boolean(user),
    isHermesChat,
    skipCacheRef,
  });

  const messageActions = useMemo<MessageActions>(
    () => ({
      sendMessage,
      regenerate,
      setMessages,
      getMessages,
      setSuggestedQuestions,
      onRetryLastTurn: handleRetry,
      onDeleteLastTurn: handleDelete,
      onBeforeSubmit,
      onHighlight,
      onToggleImageHidden,
      onVisibilityChange,
    }),
    [
      sendMessage,
      regenerate,
      setMessages,
      getMessages,
      setSuggestedQuestions,
      handleRetry,
      handleDelete,
      onBeforeSubmit,
      onHighlight,
      onToggleImageHidden,
      onVisibilityChange,
    ],
  );

  // Handle rendering of message parts - using the new MessagePartRenderer component
  const renderPart = useCallback(
    (
      part: ChatMessage['parts'][number],
      messageIndex: number,
      partIndex: number,
      parts: ChatMessage['parts'][number][],
      message: ChatMessage,
    ): React.ReactNode => {
      return (
        <MessagePartRenderer
          part={part}
          messageIndex={messageIndex}
          partIndex={partIndex}
          parts={parts}
          message={message}
          status={status}
          hasActiveToolInvocations={hasActiveToolInvocations}
          reasoningVisibilityMap={reasoningVisibilityMap}
          reasoningFullscreenMap={reasoningFullscreenMap}
          setReasoningVisibilityMap={setReasoningVisibilityMap}
          setReasoningFullscreenMap={setReasoningFullscreenMap}
          isLastMessage={messageIndex === memoizedMessages.length - 1}
          user={user ?? undefined}
          isOwner={isOwner}
          selectedVisibilityType={selectedVisibilityType}
          chatId={chatId}
          hiddenImageUrls={hiddenImageUrls}
          isHermesChat={isHermesChat}
        />
      );
    },
    [
      status,
      hasActiveToolInvocations,
      memoizedMessages.length,
      user,
      isOwner,
      selectedVisibilityType,
      chatId,
      hiddenImageUrls,
      isHermesChat,
      reasoningVisibilityMap,
      reasoningFullscreenMap,
      setReasoningVisibilityMap,
      setReasoningFullscreenMap,
    ],
  );

  // Check if we should show loading animation
  const shouldShowLoading = useMemo(() => {
    // Hermes has no useChat status to derive this from (see isHermesChat's own comment) —
    // the typing heartbeat and the draft stream are the only "agent is working" signals it
    // gets, and either one alone is enough: a draft frame can land between heartbeats.
    if (isHermesChat) return Boolean(hermesTypingLabel || hermesDraft);
    // Fire immediately via the onBeforeSubmit callback — before SDK status updates
    if (isTransitioning) return true;
    const lastMessage = memoizedMessages[memoizedMessages.length - 1];
    // Only treat a trailing user message as "awaiting a response" while a
    // request is actually in flight — otherwise a user message left dangling
    // (e.g. after deleting the assistant's reply) shows the loader forever.
    if (lastMessage?.role === 'user' && status !== 'ready') return true;
    if (status === 'submitted') return true;
    if (status === 'streaming') {
      if (lastMessage?.role === 'assistant') {
        const partsCount = lastMessage.parts?.length || 0;
        return partsCount <= 1;
      }
    }
    return false;
  }, [isTransitioning, status, memoizedMessages, isHermesChat, hermesTypingLabel, hermesDraft]);

  // Compute index of the most recent assistant message; only that one should keep min-height
  const lastAssistantIndex = useMemo(() => {
    for (let i = memoizedMessages.length - 1; i >= 0; i -= 1) {
      if (memoizedMessages[i]?.role === 'assistant') return i;
    }
    return -1;
  }, [memoizedMessages]);

  // Index of actively streaming assistant (only when last message is assistant during streaming)
  const activeAssistantIndex = useMemo(() => {
    const lastMessage = memoizedMessages[memoizedMessages.length - 1];
    if (status === 'streaming' && lastMessage?.role === 'assistant') {
      return memoizedMessages.length - 1;
    }
    return -1;
  }, [memoizedMessages, status]);

  // Is the active assistant in the initial skeleton phase (0 or 1 parts)?
  const isActiveAssistantSkeleton = useMemo(() => {
    const lastMessage = memoizedMessages[memoizedMessages.length - 1];
    if (status === 'streaming' && lastMessage?.role === 'assistant') {
      const partsCount = lastMessage.parts?.length || 0;
      return partsCount <= 1;
    }
    return false;
  }, [memoizedMessages, status]);

  // Loader reserves min-height when submitted, or streaming after user, or
  // streaming with assistant in skeleton phase (0/1 parts)
  const shouldReserveLoaderMinHeight = useMemo(() => {
    if (isTransitioning) return true;
    const lastMessage = memoizedMessages[memoizedMessages.length - 1];
    if (lastMessage?.role === 'user' && status !== 'ready') return true;
    if (status === 'submitted') return true;
    if (status === 'streaming' && isActiveAssistantSkeleton) return true;
    return false;
  }, [isTransitioning, memoizedMessages, status, isActiveAssistantSkeleton]);

  // The list never follows a streaming reply on its own, so the reader is never pulled
  // away from what they are reading (the scroll-to-bottom button does that on demand).
  // It moves once, when a new user message is added: to the end of the list, where the
  // loader's reserved height leaves that message near the top with room for the reply.
  const latestMessage = memoizedMessages[memoizedMessages.length - 1];
  const lastUserMessageId = latestMessage?.role === 'user' ? latestMessage.id : null;
  const scrolledToUserMessageIdRef = useRef(lastUserMessageId);
  useEffect(() => {
    if (!lastUserMessageId || lastUserMessageId === scrolledToUserMessageIdRef.current) return;
    scrolledToUserMessageIdRef.current = lastUserMessageId;
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' });
  }, [lastUserMessageId]);

  const renderMessageItem = useCallback(
    (index: number, message: ChatMessage) => {
      const isNextMessageAssistant =
        index < memoizedMessages.length - 1 && memoizedMessages[index + 1].role === 'assistant';
      const isCurrentMessageUser = message.role === 'user';
      const isCurrentMessageAssistant = message.role === 'assistant';
      const isLastMessage = index === memoizedMessages.length - 1;

      // Determine proper spacing between messages
      let messageClasses = '';

      if (isCurrentMessageUser && isNextMessageAssistant) {
        // Reduce space between user message and its response
        messageClasses = 'mb-0';
      } else if (isCurrentMessageAssistant && index < memoizedMessages.length - 1) {
        // Add border and spacing only if this is not the last assistant message
        messageClasses = 'mb-8 pb-6 border-b border-border dark:border-border';
      } else if (isCurrentMessageAssistant && index === memoizedMessages.length - 1) {
        // Last assistant message should have no bottom margin (min-height is now handled in Message component)
        messageClasses = 'mb-0';
      } else {
        messageClasses = 'mb-0';
      }

      return (
        <div className={messageClasses}>
          <Message
            message={message}
            index={index}
            renderPart={renderPart}
            status={status}
            isHermesChat={isHermesChat}
            hermesReaction={hermesReactions?.[message.id] ?? null}
            suggestedQuestions={index === memoizedMessages.length - 1 ? suggestedQuestions : NO_SUGGESTED_QUESTIONS}
            user={user ?? undefined}
            selectedVisibilityType={selectedVisibilityType}
            isLastMessage={isLastMessage}
            error={error}
            isMissingAssistantResponse={index === missingAssistantResponseIndex}
            isOwner={isOwner}
            attachmentsRenderer={attachmentsRenderer}
            isEditing={message.id === editingMessageId}
            onEditingChange={handleEditingChange}
            editDraft={message.id === editingMessageId ? editDraft : null}
            setEditDraft={setEditDraft}
            shouldReduceHeight={
              message.role === 'assistant'
                ? // Always reduced for a Hermes reply: the reserved height leaves room for a
                  // streaming answer, and a Hermes reply arrives complete in one frame.
                  isHermesChat ||
                  isTransitioning ||
                  status === 'submitted' ||
                  memoizedMessages[memoizedMessages.length - 1]?.role === 'user'
                  ? true
                  : status === 'streaming'
                    ? activeAssistantIndex !== -1
                      ? index === activeAssistantIndex
                        ? isActiveAssistantSkeleton
                        : true
                      : true
                    : index !== lastAssistantIndex
                : false
            }
          />
        </div>
      );
    },
    [
      memoizedMessages,
      renderPart,
      status,
      isHermesChat,
      hermesReactions,
      suggestedQuestions,
      user,
      selectedVisibilityType,
      error,
      missingAssistantResponseIndex,
      isOwner,
      attachmentsRenderer,
      editingMessageId,
      editDraft,
      handleEditingChange,
      isTransitioning,
      activeAssistantIndex,
      isActiveAssistantSkeleton,
      lastAssistantIndex,
    ],
  );

  const footerContext = useMemo<MessagesFooterContext>(
    () => ({
      isHermesChat,
      hermesDraft,
      hermesTypingLabel,
      shouldShowLoading,
      shouldReserveLoaderMinHeight,
      error: memoizedMessages[memoizedMessages.length - 1]?.role !== 'assistant' ? error : null,
      user,
      isOwner,
      selectedVisibilityType,
      handleRetry,
      handleDelete,
    }),
    [
      isHermesChat,
      hermesDraft,
      hermesTypingLabel,
      shouldShowLoading,
      shouldReserveLoaderMinHeight,
      memoizedMessages,
      error,
      user,
      isOwner,
      selectedVisibilityType,
      handleRetry,
      handleDelete,
    ],
  );

  if (memoizedMessages.length === 0) {
    return null;
  }

  return (
    <MessageActionsProvider value={messageActions}>
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', overflowX: 'hidden' }}
          data={memoizedMessages}
          computeItemKey={(index, message) => message.id ?? index}
          followOutput={false}
          atBottomStateChange={onAtBottomChange}
          atBottomThreshold={80}
          itemContent={renderMessageItem}
          context={footerContext}
          components={VIRTUOSO_COMPONENTS}
        />
    </MessageActionsProvider>
  );
});

// Add a display name for better debugging
MessagesImpl.displayName = 'MessagesImpl';
const Messages = memo(MessagesImpl);
Messages.displayName = 'Messages';

export default Messages;
