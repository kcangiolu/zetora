import React, { memo, useMemo, useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message, DELIVERABLE_TOOL_PART_TYPES } from '@/components/message';
import { DataUIPart, isToolUIPart } from 'ai';
import { EnhancedErrorDisplay } from '@/components/message';
import { MessagePartRenderer } from '@/components/message-parts';
import { StreamingIndicator } from '@/components/streaming-indicator';
import { deleteTrailingMessages } from '@/app/actions';
import { sileo } from 'sileo';
import { Attachment, ChatMessage, CustomUIDataTypes } from '@/lib/types';
import { UseChatHelpers } from '@ai-sdk/react';
import { ComprehensiveUserData } from '@/lib/user-data-server';
import { cn } from '@/lib/utils';

// react-virtuoso logs "Zero-sized element, this should not happen" at its
// hardcoded max log level (ERROR) whenever a row measures 0px on its first
// layout pass — which is exactly what a just-appended, not-yet-streamed
// assistant message row legitimately does before its first token arrives.
// It's not a real bug (the row gets remeasured and grows once content
// streams in) and ERROR is already virtuoso's default/ceiling level, so
// there's no less-noisy `logLevel` prop value to opt into instead — this
// global is virtuoso's own documented-in-source escape hatch for it.
if (typeof window !== 'undefined') {
  (window as unknown as { VIRTUOSO_LOG_LEVEL?: number }).VIRTUOSO_LOG_LEVEL = 4;
}

// Define interface for part, messageIndex and partIndex objects
interface PartInfo {
  part: any;
  messageIndex: number;
  partIndex: number;
}

interface MessagesProps {
  messages: ChatMessage[];
  lastUserMessageIndex: number;
  input: string;
  setInput: (value: string) => void;
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
  initialMessages?: any[]; // Add initial messages prop to detect existing chat
  isOwner?: boolean; // Add ownership prop
  hiddenImageUrls?: Set<string>;
  onToggleImageHidden?: (imageUrl: string, hidden: boolean) => void;
  onHighlight?: (text: string) => void; // Add highlight handler
  attachmentsRenderer?: (attachments: Attachment[]) => React.ReactNode;
  hasSubmitted?: boolean;
  isTransitioning?: boolean;
  onBeforeSubmit?: () => void;
  skipCacheRef?: React.MutableRefObject<boolean>;
  // Reserved space below the message list to clear whatever bottom bar sits over it.
  // Defaults to the height of the main chat composer; callers with a shorter bottom
  // bar (e.g. the read-only share page) should override it.
  bottomSpacerClassName?: string;
  // Fires whenever Virtuoso's own internal scroller crosses the at-bottom threshold —
  // this is the source of truth for "at bottom", since Virtuoso owns its own scroll
  // container and the outer page/window scroll doesn't move when it's virtualized.
  onAtBottomChange?: (atBottom: boolean) => void;
  // When this ref is true (finger down / nested scroller active), Virtuoso's own
  // followOutput must not re-trigger a scroll — otherwise it fights the user's touch.
  skipAutoScrollRef?: React.RefObject<boolean>;
}

export interface MessagesHandle {
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
}

const MessagesImpl = React.forwardRef<MessagesHandle, MessagesProps>(function MessagesImpl(
  {
    messages,
    lastUserMessageIndex,
    setMessages,
    suggestedQuestions,
    setSuggestedQuestions,
    status,
    error,
    user,
    selectedVisibilityType = 'private',
    chatId,
    onVisibilityChange,
    initialMessages,
    isOwner,
    hiddenImageUrls,
    onToggleImageHidden,
    onHighlight,
    attachmentsRenderer,
    sendMessage,
    regenerate,
    stop,
    hasSubmitted,
    isTransitioning,
    onBeforeSubmit,
    skipCacheRef,
    bottomSpacerClassName = 'mb-38! sm:mb-42!',
    onAtBottomChange,
    skipAutoScrollRef,
  },
  ref,
) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Track visibility state for each reasoning section using messageIndex-partIndex as key
  const [reasoningVisibilityMap, setReasoningVisibilityMap] = useState<Record<string, boolean>>({});
  const [reasoningFullscreenMap, setReasoningFullscreenMap] = useState<Record<string, boolean>>({});
  const reasoningScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter messages to only show the ones we want to display
  const memoizedMessages = useMemo(() => {
    return messages.filter((message) => message.role === 'user' || message.role === 'assistant');
  }, [messages]);

  // Compute the initial scroll target once, at mount, so incoming messages
  // don't keep resetting where Virtuoso thinks the "initial" bottom is.
  const initialTopMostItemIndexRef = useRef(Math.max(memoizedMessages.length - 1, 0));

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

    // Case 1: Last message is user and no assistant response yet
    if (lastMessage?.role === 'user' && status === 'ready' && !error) {
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
      const hasVisibleContent = hasVisibleText || hasDeliverableToolOutput;

      // If there is no visible content at all, consider the response missing
      if (!hasVisibleContent) {
        return lastIndex;
      }
    }

    return -1;
  }, [memoizedMessages, status, error]);

  // Memoize the retry handler
  const handleRetry = useCallback(async () => {
    try {
      const lastUserMessage = messages.findLast((m) => m.role === 'user');
      if (!lastUserMessage) return;

      // Step 1: Stop any in-flight stream first to prevent the old response's
      // onFinish from saving stale messages to DB after we delete them
      await stop();

      // Step 2: Small delay to allow the abort to propagate and any in-flight
      // server-side onFinish to complete before we delete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Step 3: Delete trailing messages if user is authenticated
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

      // Step 5: Update UI state
      setMessages(newMessages);
      setSuggestedQuestions([]);

      // Step 6: Regenerate, bypassing the cache for this one request
      if (skipCacheRef) skipCacheRef.current = true;
      await regenerate();
    } catch (error) {
      console.error('Error in retry:', error);
    }
  }, [messages, user, setMessages, setSuggestedQuestions, regenerate, stop, skipCacheRef]);

  // Memoize the delete handler - same as retry but without regenerating,
  // for when the user just wants to remove an orphaned/empty last turn
  // (e.g. after manually stopping generation before any content arrived).
  const handleDelete = useCallback(async () => {
    try {
      const lastUserMessage = messages.findLast((m) => m.role === 'user');
      if (!lastUserMessage) return;

      // Step 1: Stop any in-flight stream first to prevent the old response's
      // onFinish from saving stale messages to DB after we delete them
      await stop();

      // Step 2: Small delay to allow the abort to propagate and any in-flight
      // server-side onFinish to complete before we delete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Step 3: Delete trailing messages if user is authenticated
      if (user && lastUserMessage.id) {
        await deleteTrailingMessages({
          id: lastUserMessage.id,
        });
      }

      // Step 4: Update local state to remove the user message and anything after it
      const lastUserMessageIndex = messages.findIndex((m) => m.id === lastUserMessage.id);
      setMessages(messages.slice(0, lastUserMessageIndex));
      setSuggestedQuestions([]);
    } catch (error) {
      console.error('Error in delete:', error);
      sileo.error({ title: 'Failed to delete message' });
    }
  }, [messages, user, setMessages, setSuggestedQuestions, stop]);

  // Handle rendering of message parts - using the new MessagePartRenderer component
  const renderPart = useCallback(
    (
      part: ChatMessage['parts'][number],
      messageIndex: number,
      partIndex: number,
      parts: ChatMessage['parts'][number][],
      message: ChatMessage,
    ): React.ReactNode => {
      // Extract annotations from all data parts in the message
      const annotations = message.parts
        .filter((p) => p.type.startsWith('data-'))
        .map((p) => p as DataUIPart<CustomUIDataTypes>);

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
          messages={messages}
          user={user ?? undefined}
          isOwner={isOwner}
          selectedVisibilityType={selectedVisibilityType}
          chatId={chatId}
          hiddenImageUrls={hiddenImageUrls}
          onToggleImageHidden={onToggleImageHidden}
          onVisibilityChange={onVisibilityChange}
          setMessages={setMessages}
          setSuggestedQuestions={setSuggestedQuestions}
          regenerate={regenerate}
          stop={stop}
          sendMessage={sendMessage}
          onHighlight={onHighlight}
          annotations={annotations}
        />
      );
    },
    [
      status,
      hasActiveToolInvocations,
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
      stop,
      sendMessage,
      reasoningVisibilityMap,
      reasoningFullscreenMap,
      setReasoningVisibilityMap,
      setReasoningFullscreenMap,
      onHighlight,
    ],
  );

  // Check if we should show loading animation
  const shouldShowLoading = useMemo(() => {
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
  }, [isTransitioning, status, memoizedMessages]);

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

  // Add effect for auto-scrolling reasoning content
  useEffect(() => {
    // Find active reasoning parts that are not complete
    const activeReasoning = messages.flatMap((message, messageIndex) =>
      (message.parts || [])
        .map((part: any, partIndex: number) => ({ part, messageIndex, partIndex }))
        .filter(({ part }: PartInfo) => part.type === 'reasoning')
        .filter(({ messageIndex, partIndex }: PartInfo) => {
          const message = messages[messageIndex];
          // Check if reasoning is complete
          return !(message.parts || []).some(
            (p: any, i: number) => i > partIndex && (p.type === 'text' || p.type === 'tool-invocation'),
          );
        }),
    );

    // Auto-scroll when active reasoning
    if (activeReasoning.length > 0 && reasoningScrollRef.current) {
      reasoningScrollRef.current.scrollTop = reasoningScrollRef.current.scrollHeight;
    }
  }, [messages]);

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
            lastUserMessageIndex={lastUserMessageIndex}
            renderPart={renderPart}
            status={status}
            messages={messages}
            setMessages={setMessages}
            sendMessage={sendMessage}
            regenerate={regenerate}
            setSuggestedQuestions={setSuggestedQuestions}
            suggestedQuestions={index === memoizedMessages.length - 1 ? suggestedQuestions : []}
            user={user ?? undefined}
            selectedVisibilityType={selectedVisibilityType}
            isLastMessage={isLastMessage}
            error={error}
            isMissingAssistantResponse={index === missingAssistantResponseIndex}
            handleRetry={handleRetry}
            handleDelete={handleDelete}
            isOwner={isOwner}
            onHighlight={onHighlight}
            attachmentsRenderer={attachmentsRenderer}
            onBeforeSubmit={onBeforeSubmit}
            shouldReduceHeight={
              message.role === 'assistant'
                ? isTransitioning ||
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
      lastUserMessageIndex,
      renderPart,
      status,
      messages,
      setMessages,
      sendMessage,
      regenerate,
      setSuggestedQuestions,
      suggestedQuestions,
      user,
      selectedVisibilityType,
      error,
      missingAssistantResponseIndex,
      handleRetry,
      handleDelete,
      isOwner,
      onHighlight,
      attachmentsRenderer,
      onBeforeSubmit,
      isTransitioning,
      activeAssistantIndex,
      isActiveAssistantSkeleton,
      lastAssistantIndex,
    ],
  );

  const Footer = useCallback(() => {
    return (
      <>
        {/* Loading animation when status is submitted or streaming with minimal assistant content */}
        {shouldShowLoading && (
          <div
            className={`flex items-start ${shouldReserveLoaderMinHeight ? 'min-h-[calc(100vh-18rem)]' : ''} m-0! p-0!`}
          >
            <div className="w-full m-0! p-0!">
              <StreamingIndicator />
            </div>
          </div>
        )}

        {/* Show global error when there is no assistant message to display it */}
        {error && memoizedMessages[memoizedMessages.length - 1]?.role !== 'assistant' && (
          <EnhancedErrorDisplay
            error={error}
            user={user ?? undefined}
            isOwner={isOwner}
            selectedVisibilityType={selectedVisibilityType}
            handleRetry={handleRetry}
            handleDelete={handleDelete}
          />
        )}

        <div ref={messagesEndRef} />
      </>
    );
  }, [
    shouldShowLoading,
    shouldReserveLoaderMinHeight,
    error,
    memoizedMessages,
    user,
    isOwner,
    selectedVisibilityType,
    handleRetry,
    handleDelete,
  ]);

  if (memoizedMessages.length === 0) {
    return null;
  }

  return (
    <div className={cn(bottomSpacerClassName, 'flex-1 min-h-0 flex flex-col')} style={{ overflowAnchor: 'none' }}>
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%', overflowX: 'hidden' }}
        data={memoizedMessages}
        computeItemKey={(index, message) => message.id ?? index}
        followOutput={(isAtBottom) => (isAtBottom && !skipAutoScrollRef?.current ? 'smooth' : false)}
        atBottomStateChange={onAtBottomChange}
        atBottomThreshold={80}
        itemContent={renderMessageItem}
        components={{ Footer }}
      />
    </div>
  );
});

// Add a display name for better debugging
MessagesImpl.displayName = 'MessagesImpl';
const Messages = memo(MessagesImpl);
Messages.displayName = 'Messages';

export default Messages;
