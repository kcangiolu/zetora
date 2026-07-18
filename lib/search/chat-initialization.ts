import { createLogger } from '@/lib/logger';
import { ChatSDKError } from '@/lib/errors';
import { shouldBypassRateLimits, getModelProvider } from '@/ai/providers';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { createStreamId, saveNewChatWithStream } from '@/lib/db/queries';
import { getMessageCountAndExtremeSearchByUserIdAction } from '@/lib/search/server-helpers';

const log = createLogger('chat-initialization');

export interface CriticalChecksResult {
  canProceed: boolean;
  error?: any;
  isProUser: boolean;
  isMaxUser: boolean;
  messageCount?: number;
  extremeSearchUsage?: number;
  subscriptionData?: any;
  shouldBypassLimits?: boolean;
}

export interface ChatInitializationParams {
  chatQueryPromise: Promise<any>;
  lightweightUser: { userId: string; email: string; isProUser: boolean; isMaxUser: boolean } | null;
  isProUser: boolean;
  isMaxUser: boolean;
  id: string;
  streamId: string;
  selectedVisibilityType: any;
  messages: any[];
  model: string;
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
  isProUser,
  isMaxUser,
  id,
  streamId,
  selectedVisibilityType,
  messages,
  model,
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

  // Unauthenticated users don't need chat validation
  if (!lightweightUser) {
    return {
      criticalChecksPromise: Promise.resolve({
        canProceed: true,
        isProUser: false,
        isMaxUser: false,
        messageCount: 0,
        extremeSearchUsage: 0,
        subscriptionData: null,
        shouldBypassLimits: false,
      }),
      chatInitializationPromise: Promise.resolve({ isNewChat: false, titlePromise: null }),
    };
  }

  if (isTemporaryChat) {
    let criticalChecksPromise: Promise<CriticalChecksResult>;

    if (isProUser) {
      // Pro users: known from lightweightUser — resolve immediately, no DB needed
      criticalChecksPromise = Promise.resolve({
        canProceed: true,
        isProUser: true,
        isMaxUser,
        messageCount: 0,
        extremeSearchUsage: 0,
        subscriptionData: null,
        shouldBypassLimits: true,
      });
    } else {
      criticalChecksPromise = (async () => {
        const { messageCountResult, extremeSearchUsage, anthropicUsageResult, googleUsageResult } =
          await getMessageCountAndExtremeSearchByUserIdAction(lightweightUser.userId);

        if (messageCountResult.error) {
          throw new ChatSDKError('bad_request:api', 'Failed to verify usage limits');
        }
        if (extremeSearchUsage.error) {
          throw new ChatSDKError('bad_request:api', 'Failed to verify extreme search usage limits');
        }
        if (anthropicUsageResult.error) {
          throw new ChatSDKError('bad_request:api', 'Failed to verify anthropic usage limits');
        }
        if (googleUsageResult.error) {
          throw new ChatSDKError('bad_request:api', 'Failed to verify google usage limits');
        }

        const shouldBypassLimits = shouldBypassRateLimits(model, lightweightUser);
        const isAnthropicModel = getModelProvider(model) === 'anthropic';
        const isMaxGoogleModel = getModelProvider(model) === 'google' && lightweightUser.isMaxUser;
        if (!shouldBypassLimits && messageCountResult.count !== undefined && messageCountResult.count >= 100) {
          throw new ChatSDKError('rate_limit:chat', 'Daily search limit reached');
        }
        if (
          isAnthropicModel &&
          lightweightUser.isMaxUser &&
          anthropicUsageResult.count !== undefined &&
          anthropicUsageResult.count >= 60
        ) {
          throw new ChatSDKError('rate_limit:model', 'Daily Anthropic limit reached for Max users.');
        }
        if (isMaxGoogleModel && googleUsageResult.count !== undefined && googleUsageResult.count >= 80) {
          throw new ChatSDKError('rate_limit:model', 'Monthly Gemini limit reached for Max users.');
        }

        return {
          canProceed: true,
          isProUser: false,
          isMaxUser: false,
          messageCount: messageCountResult.count,
          extremeSearchUsage: extremeSearchUsage.count,
          anthropicUsage: anthropicUsageResult.count,
          subscriptionData: { hasSubscription: false },
          shouldBypassLimits,
        };
      })().catch((error) => {
        if (error instanceof ChatSDKError) throw error;
        throw new ChatSDKError('bad_request:api', 'Failed to verify user access');
      });
    }

    return {
      criticalChecksPromise,
      chatInitializationPromise: Promise.resolve({ isNewChat: false, titlePromise: null }),
    };
  }

  // Validate ownership once and get chat data
  const validatedChatPromise = withTiming(
    'chat_init.existingChat_wait',
    chatQueryPromise.then((existingChat) => {
      if (existingChat && existingChat.userId !== lightweightUser.userId) {
        throw new ChatSDKError('forbidden:chat', 'This chat belongs to another user');
      }
      return existingChat;
    }),
  );

  // Build critical checks promise first (must complete before chat creation)
  let criticalChecksPromise: Promise<CriticalChecksResult>;

  if (isProUser) {
    // Pro users: ownership check only, no usage DB calls or fullUserPromise needed.
    // validatedChatPromise is fast (cache + indexed lookup) and unblocks saveChat/createStreamId earlier.
    criticalChecksPromise = validatedChatPromise.then(() => ({
      canProceed: true,
      isProUser: true,
      isMaxUser,
      messageCount: 0,
      extremeSearchUsage: 0,
      subscriptionData: null,
      shouldBypassLimits: true,
    }));
  } else {
    // Non-Pro users: validate ownership and check usage limits.
    // Run chat validation and usage fetch in parallel to save one RTT.
    criticalChecksPromise = (async () => {
      const { validatedChat, usageResult } = await all(
        {
          async validatedChat() {
            return validatedChatPromise;
          },
          async usageResult() {
            return getMessageCountAndExtremeSearchByUserIdAction(lightweightUser.userId);
          },
        },
        getBetterAllOptions(),
      );

      if (validatedChat && validatedChat.userId !== lightweightUser.userId) {
        throw new ChatSDKError('forbidden:chat', 'This chat belongs to another user');
      }

      const { messageCountResult, extremeSearchUsage, anthropicUsageResult, googleUsageResult } = usageResult;
      if (messageCountResult.error) {
        throw new ChatSDKError('bad_request:api', 'Failed to verify usage limits');
      }
      if (extremeSearchUsage.error) {
        throw new ChatSDKError('bad_request:api', 'Failed to verify extreme search usage limits');
      }
      if (anthropicUsageResult.error) {
        throw new ChatSDKError('bad_request:api', 'Failed to verify anthropic usage limits');
      }
      if (googleUsageResult.error) {
        throw new ChatSDKError('bad_request:api', 'Failed to verify google usage limits');
      }

      const shouldBypassLimits = shouldBypassRateLimits(model, lightweightUser);
      const isAnthropicModel = getModelProvider(model) === 'anthropic';
      const isMaxGoogleModel = getModelProvider(model) === 'google' && lightweightUser.isMaxUser;
      if (!shouldBypassLimits && messageCountResult.count !== undefined && messageCountResult.count >= 100) {
        throw new ChatSDKError('rate_limit:chat', 'Daily search limit reached');
      }
      if (
        isAnthropicModel &&
        lightweightUser.isMaxUser &&
        anthropicUsageResult.count !== undefined &&
        anthropicUsageResult.count >= 60
      ) {
        throw new ChatSDKError('rate_limit:model', 'Daily Anthropic limit reached for Max users.');
      }
      if (isMaxGoogleModel && googleUsageResult.count !== undefined && googleUsageResult.count >= 80) {
        throw new ChatSDKError('rate_limit:model', 'Monthly Gemini limit reached for Max users.');
      }

      return {
        canProceed: true,
        isProUser: false,
        isMaxUser: false,
        messageCount: messageCountResult.count,
        extremeSearchUsage: extremeSearchUsage.count,
        anthropicUsage: anthropicUsageResult.count,
        subscriptionData: { hasSubscription: false },
        shouldBypassLimits,
      };
    })().catch((error) => {
      if (error instanceof ChatSDKError) throw error;
      throw new ChatSDKError('bad_request:api', 'Failed to verify user access');
    });
  }

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
            userId: lightweightUser.userId,
            title: 'New Chat',
            visibility: selectedVisibilityType,
            streamId,
          });
          // Fire off title generation without blocking chat creation
          const titlePromise = import('@/lib/search/chat-title')
            .then(({ generateTitleFromUserMessage }) =>
              generateTitleFromUserMessage({
                message: messages[messages.length - 1],
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
        if (error instanceof ChatSDKError) throw error;
        log.error('Chat initialization failed:', error);
        throw new ChatSDKError('bad_request:database', 'Failed to initialize chat');
      }),
  );

  return { criticalChecksPromise, chatInitializationPromise };
}
