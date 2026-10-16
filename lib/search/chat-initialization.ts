import { createLogger } from '@/lib/logger';
import { ChatSDKError, databaseError } from '@/lib/errors';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { createStreamId, getHermesChatLock, saveNewChatWithStream } from '@/lib/db/queries';
import { getMessageCountByUserIdAction } from '@/lib/search/server-helpers';
import { ABUSE_DAILY_LIMIT } from '@/lib/constants';

const log = createLogger('chat-initialization');

export interface CriticalChecksResult {
  canProceed: boolean;
  error?: any;
  messageCount?: number;
}

export interface ChatInitializationParams {
  chatQueryPromise: Promise<any>;
  lightweightUser: { userId: string; email: string } | null;
  id: string;
  streamId: string;
  selectedVisibilityType: any;
  messages: any[];
  isTemporaryChat: boolean;
  enableDetailedTiming?: boolean;
}

// Appends a text instruction to the last user message's text part (or adds
// one if none exists) — shared by the document/image/text-file attachment
// notices below, all of which need the model to see a URL or inlined
// content even though the raw file part itself gets stripped from the
// request sent to the model.
export function appendToLastUserMessage(messages: any[], instruction: string): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        const lastTextIndex = msg.content.findLastIndex((p: any) => p.type === 'text');
        if (lastTextIndex >= 0) {
          msg.content[lastTextIndex] = {
            ...msg.content[lastTextIndex],
            text: msg.content[lastTextIndex].text + instruction,
          };
        } else {
          msg.content.push({ type: 'text', text: instruction.trim() });
        }
      } else if (typeof msg.content === 'string') {
        msg.content = msg.content + instruction;
      }
      break;
    }
  }
}

export function initializeChatAndChecks({
  chatQueryPromise,
  lightweightUser,
  id,
  streamId,
  selectedVisibilityType,
  messages,
  isTemporaryChat,
  enableDetailedTiming = false,
}: ChatInitializationParams): {
  criticalChecksPromise: Promise<CriticalChecksResult>;
  chatInitializationPromise: Promise<{ isNewChat: boolean; titlePromise: Promise<string> | null }>;
} {
  async function withTiming<T>(label: string, promise: Promise<T>): Promise<T> {
    if (!enableDetailedTiming) return promise;
    const startedAt = Date.now();

    try {
      const value = await promise;
      log.debug(`⏱ ${label}: ${Date.now() - startedAt}ms`);
      return value;
    } catch (error) {
      log.debug(`⏱ ${label}: ${Date.now() - startedAt}ms (failed)`);
      throw error;
    }
  }

  // Login is required upstream (lib/search/access-gate.ts) before this is
  // ever invoked, so lightweightUser is always set here.
  const user = lightweightUser!;

  async function checkAbuseGuardrail(): Promise<CriticalChecksResult> {
    const { messageCount } = await getMessageCountByUserIdAction(user.userId);
    if (messageCount >= ABUSE_DAILY_LIMIT) {
      throw new ChatSDKError('rate_limit:chat', 'Daily message limit reached');
    }
    return { canProceed: true, messageCount };
  }

  if (isTemporaryChat) {
    const criticalChecksPromise = checkAbuseGuardrail().catch((error) => {
      if (error instanceof ChatSDKError) throw error;
      throw new ChatSDKError('internal:api', 'Failed to verify user access', error);
    });

    return {
      criticalChecksPromise,
      chatInitializationPromise: Promise.resolve({ isNewChat: false, titlePromise: null }),
    };
  }

  // Validate ownership once and get chat data
  const validatedChatPromise = withTiming(
    'chat_init.existingChat_wait',
    chatQueryPromise.then(async (existingChat: any) => {
      if (existingChat && existingChat.userId !== user.userId) {
        throw new ChatSDKError('forbidden:chat', 'This chat belongs to another user');
      }
      // A chat whose first message ever sent went through Agent mode is permanently a
      // Hermes conversation (see getHermesChatLock's own comment) — a native search
      // turn must never write into it, even if a stale client sends one anyway.
      if (existingChat && (await getHermesChatLock(id)) === 'hermes') {
        throw new ChatSDKError('bad_request:chat', 'This conversation is locked to Agent mode');
      }
      return existingChat;
    }),
  );

  // Validate ownership and check the abuse guardrail in parallel to save one RTT.
  let criticalChecksPromise: Promise<CriticalChecksResult> = (async () => {
    const { validatedChat, abuseCheck } = await all(
      {
        async validatedChat() {
          return validatedChatPromise;
        },
        async abuseCheck() {
          return checkAbuseGuardrail();
        },
      },
      getBetterAllOptions(),
    );

    if (validatedChat && validatedChat.userId !== user.userId) {
      throw new ChatSDKError('forbidden:chat', 'This chat belongs to another user');
    }

    return abuseCheck;
  })().catch((error) => {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError('internal:api', 'Failed to verify user access', error);
  });

  criticalChecksPromise = withTiming('chat_init.criticalResult_wait', criticalChecksPromise);

  // For existing chats, start stream ID creation immediately (runs in parallel with critical checks)
  const earlyStreamIdPromise = withTiming(
    'chat_init.streamIdCreated_wait',
    validatedChatPromise.then(async (existingChat) => {
      if (existingChat) {
        await createStreamId({ streamId, chatId: id });
        return true;
      }
      return false;
    }),
  );

  // Initialize chat (create if needed, create stream ID)
  // For new chats, wait for critical checks to complete first, then create chat (FK constraint)
  const chatInitializationPromise = withTiming(
    'chat_init.total',
    all(
      {
        async existingChat() {
          return validatedChatPromise;
        },
        async criticalResult() {
          return criticalChecksPromise;
        },
        async streamIdCreated() {
          return earlyStreamIdPromise;
        },
      },
      getBetterAllOptions(),
    )
      .then(async ({ existingChat, criticalResult }) => {
        // Verify critical checks passed before creating new chat
        if (!criticalResult.canProceed) {
          throw criticalResult.error || new ChatSDKError('bad_request:api', 'Failed to verify user access');
        }

        if (!existingChat) {
          // New chat: save chat + stream ID in one CTE query (single DB round-trip)
          await saveNewChatWithStream({
            chatId: id,
            userId: user.userId,
            title: 'New Chat',
            visibility: selectedVisibilityType,
            streamId,
          });
          // Fire off title generation without blocking chat creation
          const titlePromise = import('@/lib/search/chat-title')
            .then(({ generateTitleFromUserMessage }) =>
              generateTitleFromUserMessage({
                message: messages[messages.length - 1],
                userId: user.userId,
              }),
            )
            .catch(() => 'New Chat');
          return { isNewChat: true, titlePromise };
        } else {
          // Stream ID already created in parallel via earlyStreamIdPromise
          return { isNewChat: false, titlePromise: null };
        }
      })
      .catch((error) => {
        log.error('Chat initialization failed:', error);
        throw databaseError('Failed to initialize chat', error);
      }),
  );

  return { criticalChecksPromise, chatInitializationPromise };
}
