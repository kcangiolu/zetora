import {
  createUIMessageStream,
  streamText,
  stepCountIs,
  JsonToSseTransformStream,
  InferUIMessageChunk,
  AsyncIterableStream,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import type { LanguageModelV3, SharedV3ProviderOptions } from '@ai-sdk/provider';
import { pipeJsonRender } from '@json-render/core';
import { after } from 'next/server';
import { v7 as uuidv7 } from 'uuid';
import { all } from 'better-all';

import { createLogger } from '@/lib/logger';
import { resolveModel, getAnonymizeContext } from '@/ai/providers';
import { getModelParameters, hasVisionSupport } from '@/ai/catalog/models';
import { loadModelCatalog } from '@/ai/catalog/store';
import {
  getMessagesByChatId,
  getChatByIdForValidation,
  saveUserTurnMessage,
  incrementMessageUsage,
  updateChatTitleById,
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { CustomInstructions, Message as DbMessage } from '@/lib/db/schema';
import { getBetterAllOptions } from '@/lib/better-all';
import { markdownJoinerTransform } from '@/lib/parser';
import { ChatMessage } from '@/lib/types';
import { getGroupConfig, getBaseConfig } from '@/lib/search/group-config';
import type { SpecialModeId } from '@/lib/utils';
import { filterActiveTools, getEnabledSkillIds } from '@/lib/search/tool-filter';
import { getLightweightUser } from '@/lib/search/server-helpers';
import { getCachedCustomInstructionsByUserId, getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { getCustomProviders } from '@/lib/custom-providers';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';
import { getStartWithStrategy } from '@/lib/chat-commands-server';
import { dropBenignTextPartErrors } from '@/lib/search/benign-stream-errors';
import { loadConfiguredTools } from '@/lib/search/tool-loader';
import { loadMemoryContext } from '@/lib/memory/context';
import { runMemoryTurnUpdate } from '@/lib/memory/jobs';
import { buildMemoryQueryText, formatTurnForMemory } from '@/lib/memory/prompt';
import { isMemoryEnabled } from '@/lib/memory/settings';
import { resolvePrepareStepOverride } from '@/lib/search/prepare-step';
import { SEARCH_REQUEST_TIMEOUT_MS } from '@/lib/timeouts';
import { initializeChatAndChecks, appendToLastUserMessage } from '@/lib/search/chat-initialization';
import { checkModelAccess } from '@/lib/search/access-gate';
import { getSearchProviderOptions, getStreamTextStaticSettings } from '@/lib/search/provider-options';
import { resolveContextWindow } from '@/lib/context-window';
import { searchRequestSchema } from '@/lib/search/request-schema';
import { buildConversation, getLastUserText } from '@/lib/search/conversation-history';
import { moderateRequestImages } from '@/lib/search/request-image-moderation';
import { prepareModelMessages } from '@/lib/search/prepare-model-messages';
import { resolveTurnModel } from '@/lib/search/resolve-turn-model';
import { loadMcpStreamTools } from '@/lib/search/mcp-stream-tools';
import { applyCustomModelReasoning } from '@/lib/search/custom-model-reasoning';
import { buildDateTimeContext } from '@/lib/search/date-time-context';
import { fitToContextBudget } from '@/lib/search/fit-context-budget';
import { downloadForModel } from '@/lib/search/model-downloads';
import { createToolCallRepair } from '@/lib/search/tool-call-repair';
import { EMPTY_USAGE, usageFromSteps, usageFromTotal, type UsageMetadata } from '@/lib/search/stream-usage';
import { getStreamErrorMessage } from '@/lib/search/stream-errors';
import { persistStreamMessages } from '@/lib/search/persist-stream-messages';

const log = createLogger('search');

// Sources (web, code, academic, ...) are always-on tools filtered by user preference;
// only these modes replace the base tool set for a turn. Any other `group` ('auto', a
// retired mode id, or none) takes the base Sources+Skills path.
const SPECIAL_MODE_IDS = new Set(['mcp', 'canvas', 'deep-research', 'extreme-search']);

export async function POST(req: Request) {
  const requestStartTime = Date.now();
  const preStreamTimings: { label: string; durationMs: number }[] = [];
  const shouldLogTimings = process.env.NODE_ENV !== 'production' && process.env.DEBUG_PERF === '1';
  const recordTiming = (label: string, startTime: number) =>
    preStreamTimings.push({ label, durationMs: Date.now() - startTime });

  // Model lookups below are synchronous: make sure a catalog is loaded.
  await loadModelCatalog();

  let opStart = Date.now();
  const parsedBody = searchRequestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return new ChatSDKError('bad_request:api', parsedBody.error.issues[0]?.message ?? 'Invalid request').toResponse();
  }
  const {
    messages: requestMessages,
    model: requestedModel,
    group,
    timezone,
    id,
    selectedVisibilityType,
    isCustomInstructionsEnabled,
    sessionEnabledSources,
    isTemporaryChat,
    isAutoRouted,
    autoRouterEnabled,
    autoRouterConfig,
    visionEnabled,
    reasoningEffort,
    startWith,
  } = parsedBody.data;
  recordTiming('parse_request_body', opStart);

  // Re-checked against zetora-disabled-skills once preferences are loaded.
  let specialMode: SpecialModeId | string | undefined =
    typeof group === 'string' && SPECIAL_MODE_IDS.has(group) ? group : undefined;

  const requestLastUserMessage = (requestMessages as ChatMessage[]).findLast((message) => message.role === 'user');
  if (!requestLastUserMessage) {
    return new ChatSDKError('bad_request:api', 'A user message is required').toResponse();
  }
  // A saved chat's history is read back from the database, so the request only
  // contributes its new user message: a client cannot rewrite or forge earlier turns.
  // A temporary chat has nothing saved and sends its whole history.
  const incomingMessages: ChatMessage[] = isTemporaryChat
    ? (requestMessages as ChatMessage[])
    : [requestLastUserMessage];
  const userQueryText = requestLastUserMessage.parts
    .flatMap((p) => (p.type === 'text' ? [p.text] : []))
    .join(' ')
    .trim();

  const streamId = 'stream-' + uuidv7();

  log.info('🔍 Search API:', { requestedModel, group, specialMode, isAutoRouted, autoRouterEnabled });

  // Independent lookups start together.
  opStart = Date.now();
  const lightweightUserPromise = getLightweightUser();
  const chatQueryPromise = isTemporaryChat ? Promise.resolve(null) : getChatByIdForValidation({ id });
  const persistedMessagesPromise = isTemporaryChat
    ? Promise.resolve<ChatMessage[]>([])
    : getMessagesByChatId({ id, mostRecent: true });
  recordTiming('start_parallel_operations', opStart);

  opStart = Date.now();
  const lightweightUser = await lightweightUserPromise;
  recordTiming('get_lightweight_user', opStart);

  // Any signed-in account may use every model and mode.
  const gateError = checkModelAccess({ lightweightUser });
  if (gateError) return gateError.toResponse();

  opStart = Date.now();
  const moderationError = await moderateRequestImages(requestLastUserMessage, req.signal);
  if (moderationError) return moderationError.toResponse();
  recordTiming('image_moderation', opStart);

  opStart = Date.now();
  const configPromise = getGroupConfig(specialMode);
  const customInstructionsPromise =
    (isCustomInstructionsEnabled ?? true)
      ? getCachedCustomInstructionsByUserId(lightweightUser!.userId)
      : Promise.resolve(null);
  const userPreferencesPromise = getCachedUserPreferencesByUserId(lightweightUser!.userId);
  recordTiming('start_parallel_config_and_user_promises', opStart);

  opStart = Date.now();
  const { criticalChecksPromise, chatInitializationPromise } = initializeChatAndChecks({
    chatQueryPromise,
    lightweightUser,
    id,
    streamId,
    selectedVisibilityType,
    messages: incomingMessages,
    isTemporaryChat: Boolean(isTemporaryChat),
    enableDetailedTiming: shouldLogTimings,
  });
  recordTiming('initialize_chat_and_checks', opStart);

  // A new chat must exist before streaming: its messages reference it.
  const {
    criticalResult,
    config: rawConfig,
    customInstructionsResult,
    chatInitResult,
    userPreferencesResult,
    persistedMessages,
  } = await all(
    {
      async criticalResult() {
        return criticalChecksPromise;
      },
      async config() {
        return configPromise;
      },
      async customInstructionsResult() {
        return customInstructionsPromise;
      },
      async chatInitResult() {
        return chatInitializationPromise;
      },
      async userPreferencesResult() {
        return userPreferencesPromise;
      },
      async persistedMessages() {
        return persistedMessagesPromise;
      },
    },
    getBetterAllOptions(),
  );
  const preferences = userPreferencesResult?.preferences ?? {};

  // The mode picker (components/ui/form-component/use-mode-options.ts) hides a disabled
  // skill, but a crafted request could still ask for it: it falls back to the base path.
  if (specialMode === 'deep-research' || specialMode === 'extreme-search') {
    const disabledSkillIds = new Set((preferences['zetora-disabled-skills'] as string[] | undefined) ?? []);
    if (disabledSkillIds.has(specialMode)) specialMode = undefined;
  }
  const config = specialMode ? rawConfig : getBaseConfig();
  // Auto mode only: a user-defined system prompt (Settings → General) replaces the
  // built-in instructions, tool-calling protocol and citation rules included. Special
  // modes keep their own.
  const systemPromptOverride = preferences['zetora-system-prompt-override'];
  const instructions =
    !specialMode && typeof systemPromptOverride === 'string' && systemPromptOverride.trim()
      ? systemPromptOverride
      : config.instructions;
  recordTiming('await_parallel_setup', opStart);

  const activeTools = filterActiveTools({ tools: config.tools, specialMode, preferences, sessionEnabledSources });
  const enabledSkillIds = getEnabledSkillIds(preferences);

  if (!criticalResult.canProceed) throw criticalResult.error;
  const customInstructions: CustomInstructions | null = customInstructionsResult;

  const conversation = buildConversation({
    persisted: persistedMessages as DbMessage[],
    incoming: incomingMessages,
    isTemporaryChat: Boolean(isTemporaryChat),
  });
  const hydratedMessages = conversation.active;

  // Temporary chats neither use nor feed the memory.
  const memoryContextPromise =
    lightweightUser && !isTemporaryChat && isMemoryEnabled(preferences)
      ? loadMemoryContext(lightweightUser.userId, buildMemoryQueryText(hydratedMessages))
      : Promise.resolve(null);

  if (lightweightUser && !isTemporaryChat) {
    const newUserMessage = conversation.newIncoming.findLast((message) => message.role === 'user');
    if (newUserMessage) {
      opStart = Date.now();
      await saveUserTurnMessage({
        chatId: id,
        id: newUserMessage.id,
        parts: newUserMessage.parts,
        model: requestedModel.trim(),
      });
      recordTiming('save_user_message', opStart);
    }
  }

  if (shouldLogTimings) {
    log.info('⏱ Pre-stream operation timings (ms):', preStreamTimings);
    log.info(`🚀 Time to streamText: ${((Date.now() - requestStartTime) / 1000).toFixed(2)}s`);
  }

  const streamStartTime = Date.now();
  // Includes compacted-away messages: the client still shows them, so they are not new.
  const initialMessageIds = new Set(conversation.all.map((message) => message.id));

  const hasImages = (hydratedMessages.findLast((msg) => msg.role === 'user')?.parts ?? []).some(
    (part) => part.type === 'file' && part.mediaType.startsWith('image/'),
  );
  const resolvedTurnModel = await resolveTurnModel({
    requestedModel,
    autoRouting: isAutoRouted && autoRouterEnabled ? { routes: autoRouterConfig?.routes ?? [] } : null,
    query: getLastUserText(hydratedMessages),
    hasImages,
    preferences,
  });
  if (resolvedTurnModel instanceof ChatSDKError) return resolvedTurnModel.toResponse();
  const { model, autoRouteName } = resolvedTurnModel;

  // Without the toggle (an older client), the model's catalog vision flag, which is
  // also the toggle's default.
  const effectiveVisionEnabled = typeof visionEnabled === 'boolean' ? visionEnabled : hasVisionSupport(model);
  const prepared = await prepareModelMessages({
    conversation: hydratedMessages,
    chatId: id,
    isTemporaryChat: Boolean(isTemporaryChat),
    visionEnabled: effectiveVisionEnabled,
  });
  const { contextFiles, contextImages } = prepared;
  // Contextual memory goes after the stable prefix (system prompt and history), so it
  // never breaks prompt caching.
  const memoryContext = await memoryContextPromise;
  if (memoryContext?.contextualBlock) appendToLastUserMessage(prepared.messages, memoryContext.contextualBlock);

  // /startwith needs a real prefill (a trailing assistant message the model continues)
  // with reasoning off. Where the backend cannot do that, the request is refused before
  // any generation rather than pretending it worked.
  let startWithProviderOptions: Record<string, unknown> | undefined;
  let startWithAssistantMessageProviderOptions: SharedV3ProviderOptions | undefined;
  let startWithModelOverride: LanguageModelV3 | undefined;
  if (startWith) {
    const customProviders = model.startsWith('custom-') ? await getCustomProviders(lightweightUser?.userId) : [];
    const strategy = getStartWithStrategy(model, customProviders, hasImages);
    if (!strategy.supported) {
      return new ChatSDKError('bad_request:model', 'startWith not supported by the resolved model').toResponse();
    }
    startWithProviderOptions = strategy.providerOptions;
    startWithAssistantMessageProviderOptions = strategy.assistantMessageProviderOptions;
    startWithModelOverride = strategy.modelOverride;
  }

  // Started now so a custom provider's context-window probe overlaps the rest of setup.
  const contextWindowPromise = resolveContextWindow(model, lightweightUser?.userId);

  const abortController = new AbortController();
  // The client's disconnect is the only other abort: a stuck local model must not hold
  // the stream open forever.
  const requestTimeoutTimer =
    SEARCH_REQUEST_TIMEOUT_MS > 0 ? setTimeout(() => abortController.abort(), SEARCH_REQUEST_TIMEOUT_MS) : null;
  let finalUsage: UsageMetadata = EMPTY_USAGE;

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer: dataStream }) => {
      const mcp =
        specialMode === 'mcp' && lightweightUser ? await loadMcpStreamTools(lightweightUser.userId, dataStream) : null;
      const mcpToolNames = mcp ? Object.keys(mcp.tools) : [];
      const closeMcp = () => mcp?.close() ?? Promise.resolve();

      const streamActiveTools = [...activeTools, ...mcpToolNames];
      const loadedTools = await loadConfiguredTools({
        activeToolNames: streamActiveTools,
        dataStream,
        timezone: timezone ?? undefined,
        contextFiles,
        includeMcpTools: mcpToolNames.length > 0,
        mcpDynamicTools: mcp?.tools ?? {},
        lightweightUser,
        chatId: isTemporaryChat ? null : id,
        userPreferences: preferences,
        anonymizeContext: await getAnonymizeContext(model, preferences, lightweightUser?.userId),
        enabledSkillIds,
      });

      if (isAutoRouted && autoRouteName) {
        dataStream.write({ type: 'data-auto_routed_model', data: { model, route: autoRouteName }, transient: true });
      }

      // A new chat's title reaches the client as soon as it is generated.
      if (chatInitResult.isNewChat && chatInitResult.titlePromise) {
        chatInitResult.titlePromise.then((chatTitle) => {
          dataStream.write({ type: 'data-chat_title', data: { title: chatTitle }, transient: true });
          updateChatTitleById({ chatId: id, title: chatTitle }).catch((error) =>
            log.error('Failed to update chat title:', error),
          );
        });
      }

      const effort: ReasoningEffort = reasoningEffort ?? 'auto';
      // DeepSeek's real prefill needs a provider instance on its /beta endpoint, for
      // this call only (getDeepSeekStartWithModel).
      let resolvedModel: LanguageModel =
        startWithModelOverride ?? (await resolveModel(model, preferences, lightweightUser?.userId, hasImages));
      let customProviderOptions: Record<string, unknown> = {};
      if (model.startsWith('custom-')) {
        const custom = await applyCustomModelReasoning({
          model,
          resolvedModel,
          effort,
          userId: lightweightUser?.userId,
          hasImages,
        });
        resolvedModel = custom.model;
        customProviderOptions = custom.providerOptions;
      }
      if (startWithProviderOptions) customProviderOptions = { ...customProviderOptions, ...startWithProviderOptions };

      // The XML tool middleware turns tool schemas into prompt text and parses calls back
      // out of the reply: a step left without tools would let a local model's raw
      // <web_search> XML through to the user.
      const isXmlParsedCustomModel =
        model.startsWith('custom-') && preferences['zetora-xml-tool-parsing-enabled'] === true;
      // Kept whole so prepareStep can recompose it: its `system` replaces the prompt.
      const baseSystem =
        instructions +
        (customInstructions && (isCustomInstructionsEnabled ?? true)
          ? `\n\nThe user's custom instructions are as follows and YOU MUST FOLLOW THEM AT ALL COSTS: ${customInstructions?.content}`
          : '\n') +
        (memoryContext?.systemBlock ?? '') +
        buildDateTimeContext(timezone);
      const staticSettings = await getStreamTextStaticSettings({ specialMode, isXmlParsedCustomModel });

      const { tokens: contextWindow, known: contextWindowKnown } = await contextWindowPromise;
      if (!contextWindowKnown) {
        dataStream.write({ type: 'data-context_window_unknown', data: { tokens: contextWindow }, transient: true });
      }
      const { messages: budgetedMessages, contextBudget } = await fitToContextBudget({
        messages: prepared.messages,
        conversation: hydratedMessages,
        model,
        contextWindow,
        systemPrompt: baseSystem,
        chatId: id,
        isTemporaryChat: Boolean(isTemporaryChat),
        preferences: userPreferencesResult?.preferences,
        userId: lightweightUser?.userId,
        images: prepared.images,
        dataStream,
      });

      // /startwith answers directly in one step, continuing the prefilled message.
      const modelMessages: ModelMessage[] = startWith
        ? [
            ...budgetedMessages,
            {
              role: 'assistant' as const,
              content: startWith,
              ...(startWithAssistantMessageProviderOptions
                ? { providerOptions: startWithAssistantMessageProviderOptions }
                : {}),
            },
          ]
        : budgetedMessages;
      const requestActiveTools = startWith ? [] : streamActiveTools;
      const requestTools = startWith ? {} : loadedTools;
      const requestProviderOptions: SharedV3ProviderOptions = {
        ...getSearchProviderOptions(model, effort),
        // Plain JSON (lib/reasoning-effort.ts, lib/chat-commands-server.ts), typed loosely.
        ...(customProviderOptions as SharedV3ProviderOptions),
      };

      const result = streamText({
        model: resolvedModel,
        messages: modelMessages,
        ...getModelParameters(model, effort),
        stopWhen: startWith ? stepCountIs(1) : stepCountIs(staticSettings.stopWhenStepCount),
        maxRetries: staticSettings.maxRetries,
        abortSignal: abortController.signal,
        activeTools: requestActiveTools,
        experimental_transform: markdownJoinerTransform(),
        system: baseSystem,
        toolChoice: 'auto',
        tools: requestTools,
        providerOptions: requestProviderOptions,
        experimental_context: {
          // From the whole conversation: tools that default to "the latest image or
          // file" (edit_image) must see past the last user turn.
          images: contextImages,
          files: contextFiles,
          userPreferences: preferences,
          userId: lightweightUser?.userId,
          chatId: id,
        },
        experimental_download: downloadForModel,
        prepareStep: async ({ steps }) => {
          const latestStep = steps[steps.length - 1];
          return resolvePrepareStepOverride({
            // The base path keeps tools armed across steps, which 'auto' means here.
            group: specialMode ?? 'auto',
            isXmlParsedCustomModel,
            latestStepHasToolRoundTrip:
              Boolean(latestStep) && latestStep.toolCalls.length > 0 && latestStep.toolResults.length > 0,
            streamActiveTools,
            baseSystem,
            // What this turn's own steps used, on top of the history the budget counted.
            cumulativeTokens: steps.reduce((sum, step) => sum + (step.usage?.totalTokens ?? 0), 0),
            budgetTokens: contextBudget,
          });
        },
        experimental_repairToolCall: createToolCallRepair(preferences, lightweightUser?.userId),
        onChunk(event) {
          if (event.chunk.type === 'tool-call') log.info('Called tool:', event.chunk.toolName);
        },
        onStepFinish(event) {
          finalUsage = usageFromTotal(event.usage, (Date.now() - streamStartTime) / 1000);
        },
        onAbort(event) {
          finalUsage = usageFromSteps(event.steps, (Date.now() - streamStartTime) / 1000);
          closeMcp().catch(() => null);
        },
        onFinish: async (event) => {
          const processingTime = (Date.now() - streamStartTime) / 1000;
          finalUsage = usageFromTotal(event.totalUsage, processingTime);
          log.info(`✅ Request completed: ${processingTime.toFixed(2)}s (${event.finishReason})`);

          try {
            // Anti-abuse guardrail counter.
            if (lightweightUser?.userId && event.finishReason === 'stop') {
              await incrementMessageUsage({ userId: lightweightUser.userId }).catch((error) =>
                log.error('Failed to track usage:', error),
              );
            }
          } finally {
            await closeMcp();
          }

          if (lightweightUser && !isTemporaryChat && event.finishReason === 'stop') {
            runMemoryTurnUpdate({
              userId: lightweightUser.userId,
              chatId: id,
              preferences: userPreferencesResult?.preferences,
              turnText: formatTurnForMemory(userQueryText, event.text),
              chatRequest: {
                model: resolvedModel,
                system: baseSystem,
                messages: [...modelMessages, ...event.response.messages],
                // With the XML tool middleware, tools live in the prompt: adding them with
                // structured output would make parsing ambiguous.
                ...(isXmlParsedCustomModel ? {} : { tools: requestTools, activeTools: requestActiveTools }),
                providerOptions: requestProviderOptions,
              },
            });
          }
        },
        onError(event) {
          log.error(`❌ Request failed: ${((Date.now() - requestStartTime) / 1000).toFixed(2)}s`, event.error);
          closeMcp().catch(() => null);
        },
      });

      result.consumeStream();

      const assistantMessageCreatedAt = new Date().toISOString();
      const uiMessageStream = dropBenignTextPartErrors(
        result.toUIMessageStream({
          sendReasoning: true,
          sendSources: true,
          messageMetadata: ({ part }) => {
            const baseMetadata = { model, createdAt: assistantMessageCreatedAt };
            if (part.type !== 'finish') return baseMetadata;
            return {
              ...baseMetadata,
              completionTime: (Date.now() - streamStartTime) / 1000,
              totalTokens: part.totalUsage?.totalTokens ?? null,
              inputTokens: part.totalUsage?.inputTokens ?? null,
              outputTokens: part.totalUsage?.outputTokens ?? null,
            };
          },
        }),
      );

      dataStream.merge(
        (specialMode === 'canvas' ? pipeJsonRender(uiMessageStream) : uiMessageStream) as AsyncIterableStream<
          InferUIMessageChunk<ChatMessage>
        >,
      );
    },
    onError(error) {
      if (requestTimeoutTimer) clearTimeout(requestTimeoutTimer);
      log.error('Stream error:', error);
      return getStreamErrorMessage(error);
    },
    onFinish: async ({ messages: streamedMessages, isAborted }) => {
      if (requestTimeoutTimer) clearTimeout(requestTimeoutTimer);
      if (!lightweightUser || isTemporaryChat) return;
      await persistStreamMessages({
        chatId: id,
        streamId,
        requestUserMessageId: requestLastUserMessage.id,
        messages: streamedMessages.filter((message) => !initialMessageIds.has(message.id)),
        isAborted,
        model,
        usage: finalUsage,
      });
    },
  });

  const { getResumableStreamClients } = await import('@/lib/redis');
  const clients = getResumableStreamClients();
  if (clients) {
    const { createResumableUIMessageStream } = await import('ai-resumable-stream');
    const context = await createResumableUIMessageStream({
      streamId,
      publisher: clients.publisher,
      subscriber: clients.subscriber,
      abortController,
      waitUntil: after,
    });
    const resumableStream = await context.startStream(stream as ReadableStream<any>);
    return new Response(resumableStream.pipeThrough(new JsonToSseTransformStream()));
  }

  return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
}
