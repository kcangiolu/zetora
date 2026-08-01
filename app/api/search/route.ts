// /app/api/chat/route.ts
import {
  convertToModelMessages,
  generateText,
  Output,
  streamText,
  pruneMessages,
  NoSuchToolError,
  createUIMessageStream,
  tool,
  stepCountIs,
  JsonToSseTransformStream,
  TextPart,
  ImagePart,
  FilePart,
  InferUIMessageChunk,
  AsyncIterableStream,
  wrapLanguageModel,
} from 'ai';
import { pipeJsonRender } from '@json-render/core';
import { createLogger } from '@/lib/logger';
import {
  zetora,
  resolveModel,
  shouldBypassRateLimits,
  getModelParameters,
  hasVisionSupport,
  getAnonymizeContext,
} from '@/ai/providers';
import {
  createStreamId,
  getChatByIdForValidation,
  getLatestStreamIdByChatId,
  getLatestUserMessageIdByChatId,
  getMessagesByChatId,
  saveNewChatWithStream,
  saveMessages,
  saveUserTurnMessage,
  incrementMessageUsage,
  updateChatTitleById,
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { after } from 'next/server';
import { CustomInstructions, Message as DbMessage } from '@/lib/db/schema';
import { v7 as uuidv7 } from 'uuid';
import { geolocation } from '@vercel/functions';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { markdownJoinerTransform } from '@/lib/parser';
import { ChatMessage } from '@/lib/types';
import { getGroupConfig, getBaseConfig } from '@/lib/search/group-config';
import { getExtensionMode, getExtensionModeIds } from '@/lib/search/extension-modes';
import type { SpecialModeId } from '@/lib/utils';
import { filterActiveTools, getEnabledSkillIds } from '@/lib/search/tool-filter';
import { getLightweightUser } from '@/lib/search/server-helpers';
import { getCachedCustomInstructionsByUserId, getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveTertiaryModel } from '@/ai/tertiary';
import { getCustomProviders } from '@/lib/custom-providers';
import { getCustomReasoningOverrides, reasoningMaskMiddleware } from '@/lib/reasoning-effort';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';
import { loadConfiguredTools } from '@/lib/search/tool-loader';
import { runMemoryCurator } from '@/lib/search/memory-curator';
import { resolvePrepareStepOverride } from '@/lib/search/prepare-step';
import { SEARCH_REQUEST_TIMEOUT_MS } from '@/lib/timeouts';
import { xai } from '@ai-sdk/xai';
import { initializeChatAndChecks, appendToLastUserMessage } from '@/lib/search/chat-initialization';
import { checkModelAccess } from '@/lib/search/access-gate';
import {
  collectAttachments,
  stripFilePartsForModel,
  buildFileInstruction,
  buildImageInstruction,
  fetchInlineableTextFiles,
  appendGeneratedImagePartsToLastUserMessage,
} from '@/lib/search/message-attachments';
import { getSearchProviderOptions, getStreamTextStaticSettings } from '@/lib/search/provider-options';

const log = createLogger('search');

export async function POST(req: Request) {
  const requestStartTime = Date.now();
  const preStreamTimings: { label: string; durationMs: number }[] = [];
  const shouldLogTimings = process.env.NODE_ENV !== 'production' && process.env.DEBUG_PERF === '1';

  function recordTiming(label: string, startTime: number) {
    preStreamTimings.push({
      label,
      durationMs: Date.now() - startTime,
    });
  }

  let opStart = Date.now();
  const {
    messages: requestMessages,
    model: requestedModel,
    group,
    timezone,
    id,
    selectedVisibilityType,
    isCustomInstructionsEnabled,
    searchProvider,
    selectedConnectors,
    sessionEnabledSources,
    extensionSettings,
    isTemporaryChat,
    isAutoRouted,
    autoRouterEnabled,
    autoRouterConfig,
    visionEnabled,
    reasoningEffort,
  } = await req.json();
  recordTiming('parse_request_body', opStart);

  // Sources (web, code, academic, ...) are always-on tools filtered by user
  // preference now, not exclusive modes — only these still fully replace the
  // base tool set for a turn. Any other/legacy `group` value (old single-
  // purpose modes, 'auto', or absent) falls through to the base Sources+
  // Skills path.
  const SPECIAL_MODE_IDS = new Set(['connectors', 'mcp', 'multi-agent', 'canvas', 'deep-research', 'extreme-search']);
  // Extension-registered modes (lib/search/extension-modes.ts) are exclusive
  // in the same sense as the hardcoded ids above — populated by loadExtensions()
  // at boot (instrumentation.ts), empty when no overlay is checked out.
  // `let` because deep-research/extreme-search get re-validated against
  // zetora-disabled-skills once preferences are available below and
  // downgraded back to undefined if the requester disabled that skill.
  let specialMode: SpecialModeId | string | undefined =
    typeof group === 'string' && (SPECIAL_MODE_IDS.has(group) || (await getExtensionModeIds()).includes(group))
      ? group
      : undefined;

  if (!Array.isArray(requestMessages) || requestMessages.length === 0) {
    return new ChatSDKError('bad_request:api', 'Messages array is required and cannot be empty').toResponse();
  }

  const incomingMessages = requestMessages as ChatMessage[];
  const requestLastUserMessage = [...incomingMessages].reverse().find((message) => message.role === 'user');

  const userQueryText = requestLastUserMessage
    ? (requestLastUserMessage.parts as any[])
        .filter((p) => p.type === 'text')
        .map((p) => p.text as string)
        .join(' ')
        .trim()
    : '';

  if (!requestLastUserMessage) {
    return new ChatSDKError('bad_request:api', 'A user message is required').toResponse();
  }

  opStart = Date.now();
  const { latitude, longitude } = geolocation(req);
  recordTiming('geolocation_lookup', opStart);

  const streamId = 'stream-' + uuidv7();

  // Initialize model - will be updated by auto-router if needed
  let model = requestedModel.trim();
  let autoRouteName: string | undefined;

  log.info('🔍 Search API:', {
    model,
    requestedModel,
    group,
    specialMode,
    latitude,
    longitude,
    isAutoRouted,
    autoRouterEnabled,
  });

  // Start all independent operations in parallel immediately
  opStart = Date.now();
  const lightweightUserPromise = getLightweightUser();
  // Use lightweight validation query - only fetches id and userId
  const chatQueryPromise = isTemporaryChat ? Promise.resolve(null) : getChatByIdForValidation({ id });
  const persistedMessagesPromise =
    isTemporaryChat || incomingMessages.length > 1 ? Promise.resolve<ChatMessage[]>([]) : getMessagesByChatId({ id });
  recordTiming('start_parallel_operations', opStart);

  // Wait for lightweight user first (needed for early exit checks)
  opStart = Date.now();
  const lightweightUser = await lightweightUserPromise;
  recordTiming('get_lightweight_user', opStart);

  // Login is required to make a request — any connected account has access
  // to every model/mode, so there is no further tier gate to check.
  const gateError = checkModelAccess({ lightweightUser });
  if (gateError) {
    return gateError.toResponse();
  }

  const shouldUseXaiMultiAgent = specialMode === 'multi-agent';

  // Start config and custom instructions in parallel
  opStart = Date.now();
  const configPromise = getGroupConfig(specialMode);
  const customInstructionsPromise =
    (isCustomInstructionsEnabled ?? true)
      ? getCachedCustomInstructionsByUserId(lightweightUser!.userId)
      : Promise.resolve(null);
  const userPreferencesPromise = getCachedUserPreferencesByUserId(lightweightUser!.userId);
  recordTiming('start_parallel_config_and_user_promises', opStart);

  // Initialize chat and perform critical checks (chatQueryPromise already started)
  opStart = Date.now();
  const { criticalChecksPromise, chatInitializationPromise } = initializeChatAndChecks({
    chatQueryPromise,
    lightweightUser,
    id,
    streamId,
    selectedVisibilityType,
    messages: incomingMessages,
    model,
    isTemporaryChat: Boolean(isTemporaryChat),
    enableDetailedTiming: shouldLogTimings,
  });
  recordTiming('initialize_chat_and_checks', opStart);

  let customInstructions: CustomInstructions | null = null;

  // Wait for critical checks, config, and chat initialization in parallel
  // Chat initialization is critical: for new chats it must complete before streaming (FK constraint)
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
        return chatInitializationPromise; // Must complete before streaming (especially for new chats)
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

  // Defense in depth: the mode picker (components/ui/form-component/index.tsx)
  // already hides deep-research/extreme-search once their skill is disabled
  // and reverts a currently-selected one back to 'auto', but that's
  // client-side only — a crafted/replayed request could still send
  // group: 'deep-research' after the user disabled that skill. Re-validate
  // against the just-resolved preferences here and silently fall back to the
  // base Auto config, same as an unrecognized/legacy group id already does.
  if (specialMode === 'deep-research' || specialMode === 'extreme-search') {
    const disabledSkillIds = new Set(
      (userPreferencesResult?.preferences?.['zetora-disabled-skills'] as string[] | undefined) ?? [],
    );
    if (disabledSkillIds.has(specialMode)) {
      specialMode = undefined;
    }
  }
  // getBaseConfig() is a plain sync object literal (autoGroup.tools/instructions) —
  // free to call again here even though configPromise already resolved above
  // using the pre-guard specialMode.
  const config = specialMode ? rawConfig : getBaseConfig();
  const { instructions } = config;
  recordTiming('await_parallel_setup', opStart);

  const activeTools = filterActiveTools({
    tools: config.tools,
    specialMode,
    preferences: userPreferencesResult?.preferences,
    sessionEnabledSources,
  });

  const enabledSkillIds = getEnabledSkillIds(userPreferencesResult?.preferences);

  if (!criticalResult.canProceed) {
    throw criticalResult.error;
  }

  customInstructions = customInstructionsResult;

  const persistedDbMessages = persistedMessages as DbMessage[];
  const persistedMessageIds = new Set(persistedDbMessages.map((message) => message.id));
  const newIncomingMessages = incomingMessages.filter((message) => !persistedMessageIds.has(message.id));
  const normalizedPersistedMessages: ChatMessage[] = persistedDbMessages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: (message.parts as ChatMessage['parts']) ?? [],
    metadata: {
      createdAt: message.createdAt.toISOString(),
      model: message.model ?? '',
      completionTime: message.completionTime ?? null,
      inputTokens: message.inputTokens ?? null,
      outputTokens: message.outputTokens ?? null,
      totalTokens: message.totalTokens ?? null,
    },
  }));
  const hydratedMessages =
    !isTemporaryChat && normalizedPersistedMessages.length > 0 && incomingMessages.length === 1
      ? [...normalizedPersistedMessages, ...newIncomingMessages]
      : incomingMessages;

  // Save user message (chat is guaranteed to exist now) - await synchronously (no background)
  if (lightweightUser && !isTemporaryChat && newIncomingMessages.length > 0) {
    const latestIncomingUserMessage = [...newIncomingMessages].reverse().find((message) => message.role === 'user');

    if (latestIncomingUserMessage) {
      opStart = Date.now();
      await saveUserTurnMessage({
        chatId: id,
        id: latestIncomingUserMessage.id,
        parts: latestIncomingUserMessage.parts,
        model,
      });
      recordTiming('save_user_message', opStart);
    }
  }

  const setupTimeMs = Date.now() - requestStartTime;
  if (shouldLogTimings) {
    log.info('⏱ Pre-stream operation timings (ms):', preStreamTimings);
    log.info(`🚀 Time to streamText: ${(setupTimeMs / 1000).toFixed(2)}s`);
  }

  const streamStartTime = Date.now();
  const initialMessageIds = new Set(hydratedMessages.map((message: any) => message.id));
  const requestLastUserMessageId: string | null = requestLastUserMessage?.id ?? null;

  const userMessageCount = hydratedMessages.filter((message: any) => message.role === 'user').length;
  const shouldPrune = userMessageCount > 10;

  const cachePreferences = (userPreferencesResult?.preferences ?? {}) as Record<string, string>;

  const prunedMessages = shouldPrune
    ? await (async () => {
        log.info(`🔧 Pruning messages: ${userMessageCount} user messages (${hydratedMessages.length} total messages)`);
        const pruned = pruneMessages({
          reasoning: 'all',
          messages: await convertToModelMessages(hydratedMessages, {
            ignoreIncompleteToolCalls: true,
          }),
          toolCalls: 'before-last-5-messages',
        });
        log.info(`✂️ Pruned to ${pruned.length} messages`);
        return pruned;
      })()
    : await convertToModelMessages(hydratedMessages, {
        ignoreIncompleteToolCalls: true,
      });

  // Collect every attached file across the conversation: documents for
  // file_query_search, images (vision / edit_image), and other files that
  // are decoded as text below.
  const { contextFiles, contextImages, contextGeneratedImages, otherFileParts } = collectAttachments(hydratedMessages);

  // Falls back to the model's catalog vision flag if the client didn't send
  // the toggle (older client) — same default the toggle itself starts from.
  const effectiveVisionEnabled = typeof visionEnabled === 'boolean' ? visionEnabled : hasVisionSupport(model);

  const processedMessages = stripFilePartsForModel(prunedMessages, effectiveVisionEnabled);

  // If there are document files in the conversation, add instruction to the last user message
  if (contextFiles.length > 0) {
    appendToLastUserMessage(processedMessages, buildFileInstruction(contextFiles));
  }

  if (contextImages.length > 0) {
    appendToLastUserMessage(processedMessages, buildImageInstruction(contextImages, effectiveVisionEnabled));
  }

  // Generated/edited images have no `file` part for stripFilePartsForModel
  // to keep — the URL-only instruction above already covers "treat it as an
  // object" (edit_image) whether or not Vision is on; this is what actually
  // makes the model see the pixels when Vision is on.
  if (effectiveVisionEnabled && contextGeneratedImages.length > 0) {
    appendGeneratedImagePartsToLastUserMessage(processedMessages, contextGeneratedImages);
  }

  if (otherFileParts.length > 0) {
    const { inlineTextFiles, unreadableFiles, largeTextFiles } = await fetchInlineableTextFiles(otherFileParts);
    // Large text files are routed through file_query_search like any other
    // document.
    contextFiles.push(...largeTextFiles);

    if (inlineTextFiles.length > 0 || unreadableFiles.length > 0) {
      const inlineBlocks = inlineTextFiles
        .map((f) => `\n\n[Attached file: ${f.name}]\n\`\`\`\n${f.text}\n\`\`\``)
        .join('');
      const unreadableNote =
        unreadableFiles.length > 0
          ? `\n\n[Could not read as text, skipped: ${unreadableFiles.map((f) => f.name).join(', ')}]`
          : '';
      appendToLastUserMessage(processedMessages, inlineBlocks + unreadableNote);
    }

    // Large text files pushed into contextFiles above need the same
    // file_query_search instruction as other documents.
    if (contextFiles.some((f) => otherFileParts.some((o) => o.url === f.url))) {
      const fileNames = otherFileParts
        .filter((o) => contextFiles.some((f) => f.url === o.url))
        .map((f) => f.name || 'unnamed file')
        .join(', ');
      appendToLastUserMessage(
        processedMessages,
        `\n\n[Large attached files: ${fileNames}. Use the file_query_search tool to search and retrieve information from these files.]`,
      );
    }
  }

  // Detect images in last user message for auto-routing
  const lastUserMessage = [...hydratedMessages].reverse().find((msg) => msg.role === 'user');
  const lastUserParts = (lastUserMessage?.parts as (TextPart | ImagePart | FilePart)[]) ?? [];
  const hasImages = lastUserParts.some((part) => part.type === 'file' && (part as any).mediaType?.startsWith('image/'));

  // Auto-routing logic - run on server side if auto router is selected
  if (isAutoRouted && autoRouterEnabled && requestedModel === 'zetora-auto') {
    // Extract last user query for routing
    let query = '';
    for (let i = hydratedMessages.length - 1; i >= 0; i--) {
      const msg = hydratedMessages[i];
      if (msg.role === 'user') {
        const parts = (msg.parts as (TextPart | ImagePart | FilePart)[]) ?? [];
        for (let j = parts.length - 1; j >= 0; j--) {
          const part = parts[j];
          if (part.type === 'text' && part.text) {
            query = part.text;
            break;
          }
        }
        if (query) break;
      }
    }

    // Run auto router with user's configured routes
    const routes = autoRouterConfig?.routes ?? [];
    if (query && routes.length > 0) {
      try {
        const { routeWithAutoRouter } = await import('@/lib/search/auto-router');
        const routeResult = await routeWithAutoRouter({ query, routes, hasImages });
        if (routeResult?.success && routeResult.model) {
          model = routeResult.model;
          autoRouteName = routeResult.route;
        } else {
          model = 'zetora-default';
        }
      } catch (error) {
        log.error('Auto router error:', error);
        model = 'zetora-default';
      }
    } else {
      model = 'zetora-default';
    }

    if (hasImages && !hasVisionSupport(model)) {
      model = 'zetora-default';
      autoRouteName = 'other';
    }
  }

  const abortController = new AbortController();
  // Belt-and-suspenders: abortController otherwise only trips on client
  // disconnect, so a stuck local model could hold a stream open indefinitely.
  const requestTimeoutTimer =
    SEARCH_REQUEST_TIMEOUT_MS > 0 ? setTimeout(() => abortController.abort(), SEARCH_REQUEST_TIMEOUT_MS) : null;
  let finalUsageMetadata: {
    completionTime: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  } = {
    completionTime: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  };

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer: dataStream }) => {
      const mcpDynamicTools: Record<string, any> = {};
      let dynamicToolNames: string[] = [];
      const closeDynamicToolsFns: Array<() => Promise<void>> = [];
      let mcpToolsClosed = false;

      const closeMcpToolsSafe = async () => {
        if (mcpToolsClosed) return;
        mcpToolsClosed = true;
        await Promise.all(
          closeDynamicToolsFns.map((closeFn) =>
            closeFn().catch((error) => {
              log.warn('Failed closing MCP clients:', error);
            }),
          ),
        );
      };

      const shouldLoadMcpTools = specialMode === 'mcp';

      if (shouldLoadMcpTools && lightweightUser) {
        const { resolveUserMcpTools } = await import('@/lib/tools/mcp-client');
        const resolvedMcp = await resolveUserMcpTools({
          userId: lightweightUser.userId,
          dataStream,
        });
        Object.assign(mcpDynamicTools, resolvedMcp.tools);
        dynamicToolNames = [...dynamicToolNames, ...Object.keys(resolvedMcp.tools)];
        closeDynamicToolsFns.push(resolvedMcp.closeAll);

        if (resolvedMcp.errors.length > 0) {
          log.warn('MCP tool loading errors:', resolvedMcp.errors);
        }
      }

      // A registered extension mode (see lib/search/extension-modes.ts) may
      // contribute its own dynamically-resolved tools — e.g. the private
      // agent overlay's coordinator connecting to internal infra MCP
      // servers. Generic here: the core has no idea what these tools are.
      const resolveDynamicTools = (await getExtensionMode(specialMode))?.resolveDynamicTools;
      if (resolveDynamicTools && lightweightUser) {
        const resolved = await resolveDynamicTools({
          userId: lightweightUser.userId,
          dataStream,
          extensionSettings,
        });
        Object.assign(mcpDynamicTools, resolved.tools);
        dynamicToolNames = [...dynamicToolNames, ...resolved.toolNames];
        closeDynamicToolsFns.push(resolved.closeAll);
      }

      const configuredActiveTools = [...activeTools, ...dynamicToolNames];
      const streamActiveTools =
        model === 'zetora-qwen-coder-plus' || model === 'zetora-qwen-3-vl' || model === 'zetora-qwen-3-vl-thinking'
          ? [...configuredActiveTools].filter((tool) => tool !== 'code_interpreter')
          : [...configuredActiveTools];
      const anonymizeContext = await getAnonymizeContext(
        model,
        userPreferencesResult?.preferences ?? {},
        lightweightUser?.userId,
      );

      const loadedTools = await loadConfiguredTools({
        activeToolNames: streamActiveTools,
        dataStream,
        searchProvider,
        timezone,
        contextFiles,
        includeMcpTools: dynamicToolNames.length > 0,
        mcpDynamicTools,
        lightweightUser,
        selectedConnectors,
        memoryProvider:
          (userPreferencesResult?.preferences?.['zetora-memory-provider'] as 'supermemory' | 'graphiti' | undefined) ||
          'supermemory',
        userPreferences: (userPreferencesResult?.preferences ?? {}) as Record<string, unknown>,
        anonymizeContext,
        enabledSkillIds,
      });

      const streamTools = shouldUseXaiMultiAgent
        ? {
            ...loadedTools,
            xai_web_search: xai.tools.webSearch(),
            xai_x_search: xai.tools.xSearch(),
          }
        : loadedTools;

      function setUsageMetadataFromUsage(
        usage:
          | {
              inputTokens?: number;
              outputTokens?: number;
              totalTokens?: number;
            }
          | undefined,
        completionTime: number,
      ) {
        const inputTokens = usage?.inputTokens ?? null;
        const outputTokens = usage?.outputTokens ?? null;
        const totalTokens =
          usage?.totalTokens ??
          (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);

        finalUsageMetadata = {
          completionTime,
          inputTokens,
          outputTokens,
          totalTokens,
        };
      }

      function setUsageMetadataFromSteps(
        steps: Array<{
          usage?: {
            inputTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
          };
        }>,
        completionTime: number,
      ) {
        let inputTokens = 0;
        let outputTokens = 0;
        let totalTokens = 0;
        let hasInputTokens = false;
        let hasOutputTokens = false;
        let hasTotalTokens = false;

        for (const step of steps) {
          if (typeof step.usage?.inputTokens === 'number') {
            inputTokens += step.usage.inputTokens;
            hasInputTokens = true;
          }
          if (typeof step.usage?.outputTokens === 'number') {
            outputTokens += step.usage.outputTokens;
            hasOutputTokens = true;
          }
          if (typeof step.usage?.totalTokens === 'number') {
            totalTokens += step.usage.totalTokens;
            hasTotalTokens = true;
          }
        }

        finalUsageMetadata = {
          completionTime,
          inputTokens: hasInputTokens ? inputTokens : null,
          outputTokens: hasOutputTokens ? outputTokens : null,
          totalTokens: hasTotalTokens
            ? totalTokens
            : hasInputTokens || hasOutputTokens
              ? inputTokens + outputTokens
              : null,
        };
      }

      // Stream the auto-routed model info to the client
      if (isAutoRouted && autoRouteName) {
        dataStream.write({
          type: 'data-auto_routed_model',
          data: { model, route: autoRouteName },
          transient: true,
        });
      }

      // Stream chat title for new chats so client can update immediately
      if (chatInitResult.isNewChat && chatInitResult.titlePromise) {
        chatInitResult.titlePromise.then((chatTitle) => {
          dataStream.write({
            type: 'data-chat_title',
            data: { title: chatTitle },
            transient: true,
          });
          // Update the placeholder title in the DB
          updateChatTitleById({ chatId: id, title: chatTitle }).catch((error) =>
            log.error('Failed to update chat title:', error),
          );
        });
      }

      const VALID_REASONING_EFFORTS = new Set(['auto', 'low', 'medium', 'high', 'off']);
      const effort: ReasoningEffort = VALID_REASONING_EFFORTS.has(reasoningEffort) ? reasoningEffort : 'auto';

      let resolvedModel = shouldUseXaiMultiAgent
        ? xai.responses('grok-4.20-multi-agent')
        : await resolveModel(model, userPreferencesResult?.preferences ?? {}, lightweightUser?.userId);

      // Custom providers aren't covered by getSearchProviderOptions (that's
      // zetora-* only) — resolve their reasoning override separately. vLLM/
      // llama.cpp backends get a real control param merged into providerOptions
      // below; Ollama/unknown backends can only have their <think> output
      // hidden after the fact, via middleware.
      let customReasoningProviderOptions: Record<string, unknown> = {};
      if (!shouldUseXaiMultiAgent && model.startsWith('custom-') && effort !== 'auto') {
        const customProviders = await getCustomProviders(lightweightUser?.userId);
        const overrides = getCustomReasoningOverrides(model, effort, customProviders);
        customReasoningProviderOptions = overrides.providerOptions;
        if (overrides.applyMaskMiddleware) {
          resolvedModel = wrapLanguageModel({
            model: resolvedModel as Extract<typeof resolvedModel, { specificationVersion: 'v3' }>,
            middleware: reasoningMaskMiddleware,
          });
        }
      }
      // Custom models parsed via the XML tool middleware need their tool
      // schemas present on every step: the middleware strips native tools into
      // a prompt and relies on the schemas to convert the model's XML back into
      // tool calls. If a later step is left with no tools (see prepareStep's
      // tool-disabling heuristic) and the model still emits a tool call — as the
      // local Qwen3 models routinely do — the parser has nothing to match and
      // the raw <web_search> XML leaks straight to the user.
      const isXmlParsedCustomModel =
        !shouldUseXaiMultiAgent &&
        model.startsWith('custom-') &&
        userPreferencesResult?.preferences?.['zetora-xml-tool-parsing-enabled'] === true;
      // Factored out so prepareStep can recompose it with the synthesis nudge
      // (prepareStep's `system` return REPLACES the system prompt, it does not append).
      const baseSystem =
        instructions +
        (customInstructions && (isCustomInstructionsEnabled ?? true)
          ? `\n\nThe user's custom instructions are as follows and YOU MUST FOLLOW THEM AT ALL COSTS: ${customInstructions?.content}`
          : '\n') +
        (latitude && longitude && userPreferencesResult?.preferences?.['zetora-location-metadata-enabled'] === true
          ? `\n\nThe user's location is ${latitude}, ${longitude}.`
          : '') +
        (shouldUseXaiMultiAgent
          ? '\n\nWhen multi-agent mode is enabled, you are operating in a high-agency research workflow. Use only the xAI server-side web search and X search tools available in this environment. Do not call any other research or search tools.\n\nYour job is to behave like a rigorous research analyst:\n- Break the request into sub-questions when useful.\n- Search broadly first, then narrow based on what you find.\n- Use multiple searches when the topic is ambiguous, fast-moving, comparative, or requires validation.\n- Cross-check important claims across multiple sources whenever possible.\n- Prefer recent and primary sources for news, releases, product changes, pricing, benchmarks, and policy updates.\n- Use X search when social signals, firsthand announcements, or fast-moving discourse are relevant.\n- Use web search when you need official documentation, articles, product pages, blogs, papers, or other published sources.\n- If both web and X are relevant, use both.\n\nOutput requirements:\n- Synthesize findings into a clear, direct answer instead of narrating every search step.\n- Be concise but complete.\n- Include uncertainty when evidence is mixed, incomplete, or time-sensitive.\n- Do not fabricate facts, sources, timelines, quotes, or consensus.\n- If you cannot verify a claim well enough, say so plainly.\n- Ground the final answer in the sources you found and make sure the answer actually reflects them.\n\nResponse structure guidelines:\n- Start with a direct answer or conclusion in 1-3 sentences.\n- Then present the most important findings as short sections or bullet points.\n- For comparative questions, explicitly compare the options point-by-point.\n- For fast-moving topics, clearly separate confirmed facts from tentative signals.\n- End with a brief takeaway, recommendation, or next step when useful.\n- Keep the response skimmable and avoid long, repetitive paragraphs.\n\nTool behavior requirements:\n- Do not mention internal tool limitations unless necessary.\n- Do not ask for permission to search.\n- Do not stop after a single weak search if the question clearly needs deeper verification.\n- Avoid redundant searches that do not add evidence.\n- Prefer quality of evidence over quantity of searches.'
          : '');
      const staticSettings = await getStreamTextStaticSettings({
        model,
        specialMode,
        shouldUseXaiMultiAgent,
        isXmlParsedCustomModel,
      });
      const result = streamText({
        model: resolvedModel,
        messages: processedMessages,
        ...getModelParameters(shouldUseXaiMultiAgent ? 'grok-4.20-multi-agent' : model),
        stopWhen: stepCountIs(staticSettings.stopWhenStepCount),
        ...(staticSettings.maxOutputTokens !== undefined ? { maxOutputTokens: staticSettings.maxOutputTokens } : {}),
        maxRetries: staticSettings.maxRetries,
        abortSignal: abortController.signal,
        activeTools: shouldUseXaiMultiAgent ? ['xai_web_search', 'xai_x_search'] : streamActiveTools,
        experimental_transform: markdownJoinerTransform(),
        system: baseSystem,
        toolChoice: 'auto',
        tools: streamTools,
        ...(staticSettings.headers ? { headers: staticSettings.headers } : {}),
        providerOptions: {
          ...getSearchProviderOptions(model, shouldUseXaiMultiAgent, effort),
          ...customReasoningProviderOptions,
        },
        experimental_context: {
          // contextImages/contextFiles (collectAttachments, above) already scan
          // every message in the conversation — not just the last one — and
          // contextImages also includes images produced by generate_image/
          // edit_image. Tools that default to "the most recent image/file when
          // none is specified" (edit_image) must resolve against the whole
          // conversation, or the fallback silently misses anything beyond the
          // latest user turn.
          images: contextImages,
          files: contextFiles,
          userPreferences: userPreferencesResult?.preferences ?? {},
          userId: lightweightUser?.userId,
          chatId: id,
        },
        experimental_download: async (requestedDownloads) => {
          type DownloadResult = { data: Uint8Array; mediaType: string | undefined } | null;

          // Download for models that can't fetch R2 URLs directly
          const requiresDownload =
            model.startsWith('zetora-anthropic') ||
            model.startsWith('zetora-google') ||
            model.startsWith('zetora-gemini');

          if (!requiresDownload) {
            // Let other models handle URLs directly
            return requestedDownloads.map(() => null);
          }

          const downloadTasks = requestedDownloads.reduce(
            (acc, { url }, index) => {
              acc[`dl:${index}`] = async (): Promise<DownloadResult> => {
                log.info(`Downloading for Anthropic: ${url.toString()}`);
                const response = await fetch(url.toString());
                if (!response.ok) {
                  log.error(`Download failed: ${url.toString()} - ${response.status}`);
                  throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
                }

                const data = new Uint8Array(await response.arrayBuffer());
                const mediaType = response.headers.get('content-type') || undefined;

                log.info(`Download succeeded: ${url.toString()} (${data.byteLength} bytes, ${mediaType})`);
                return { data, mediaType };
              };
              return acc;
            },
            {} as Record<string, () => Promise<DownloadResult>>,
          );

          const results = await all(downloadTasks, getBetterAllOptions());

          // Convert back to ordered array
          return requestedDownloads.map((_, index) => results[`dl:${index}`]);
        },
        prepareStep: async ({ steps }) => {
          const latestStep = steps[steps.length - 1];
          const latestStepHasToolRoundTrip =
            Boolean(latestStep) && latestStep.toolCalls.length > 0 && latestStep.toolResults.length > 0;

          return resolvePrepareStepOverride({
            // No exclusive special mode means the base Sources+Skills path,
            // which behaves like the old Auto mode (keeps tools armed across
            // steps for the skill-load-then-research loop) — synthesize the
            // 'auto' sentinel resolvePrepareStepOverride already expects.
            group: specialMode ?? 'auto',
            shouldUseXaiMultiAgent,
            isXmlParsedCustomModel,
            model,
            latestStepHasToolRoundTrip,
            streamActiveTools,
            baseSystem,
            keepToolsArmed: (await getExtensionMode(specialMode))?.keepToolsArmed,
          });
        },

        experimental_repairToolCall: async ({ toolCall, tools, inputSchema, error }) => {
          if (NoSuchToolError.isInstance(error)) {
            return null;
          }

          log.debug('Repairing tool call', { toolCall, tools, inputSchema, error });

          const tool = tools[toolCall.toolName as keyof typeof tools];

          if (!tool) {
            return null;
          }

          // The 'tool-repair' tertiary task is user-configurable to any
          // custom/local provider (see resolveTertiaryModel), which may not
          // support structured output — Output.object then throws
          // AI_NoOutputGeneratedError. Since this callback previously had no
          // try/catch, that exception propagated out of streamText and killed
          // the whole response mid-stream instead of just leaving the
          // original tool-call error in place. Returning null tells the SDK
          // the repair failed, which is exactly what happens for NoSuchToolError above.
          try {
            const { output: repairedArgs } = await generateText({
              model: await resolveTertiaryModel('tool-repair', cachePreferences, lightweightUser?.userId),
              output: Output.object({ schema: tool.inputSchema }),
              prompt: [
                `The model tried to call the tool "${toolCall.toolName}"` + ` with the following arguments:`,
                JSON.stringify(toolCall.input),
                `The tool accepts the following schema:`,
                JSON.stringify(inputSchema(toolCall)),
                'Please fix the arguments.',
                'For the code interpreter tool do not use print statements.',
                `For the web search make multiple queries to get the best results but avoid using the same query multiple times.`,
                `Today's date is ${new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}`,
              ].join('\n'),
            });

            log.debug('repairedArgs', repairedArgs);

            return { ...toolCall, args: JSON.stringify(repairedArgs) };
          } catch (repairError) {
            log.error('Failed to repair tool call:', repairError);
            return null;
          }
        },
        onChunk(event) {
          if (event.chunk.type === 'tool-call') {
            log.info('Called tool:', event.chunk.toolName);
          }
        },
        onStepFinish(event) {
          const processingTime = (Date.now() - streamStartTime) / 1000;
          setUsageMetadataFromUsage(event.usage, processingTime);
        },
        onAbort(event) {
          const processingTime = (Date.now() - streamStartTime) / 1000;
          setUsageMetadataFromSteps(event.steps, processingTime);
          closeMcpToolsSafe().catch(() => null);
        },
        onFinish: async (event) => {
          const processingTime = (Date.now() - streamStartTime) / 1000;
          setUsageMetadataFromUsage(event.totalUsage, processingTime);
          log.info(`✅ Request completed: ${processingTime.toFixed(2)}s (${event.finishReason})`);

          try {
            if (lightweightUser?.userId && event.finishReason === 'stop') {
              // Anti-abuse guardrail counter — the only usage tracking left
              // now that Pro/Max-specific limits are gone.
              try {
                if (!shouldBypassRateLimits(model, lightweightUser)) {
                  await incrementMessageUsage({ userId: lightweightUser.userId });
                }
              } catch (error) {
                log.error('Failed to track usage:', error);
              }
            }
          } finally {
            await closeMcpToolsSafe();
          }
        },
        onError(event) {
          const processingTime = (Date.now() - requestStartTime) / 1000;
          log.error(`❌ Request failed: ${processingTime.toFixed(2)}s`, event.error);
          closeMcpToolsSafe().catch(() => null);
        },
      });

      result.consumeStream();

      const assistantMessageCreatedAt = new Date().toISOString();

      const uiMessageStream = result.toUIMessageStream({
        sendReasoning: true,
        sendSources: true,
        messageMetadata: ({ part }) => {
          const baseMetadata = {
            model: model as string,
            createdAt: assistantMessageCreatedAt,
            multiAgentMode: shouldUseXaiMultiAgent,
          };

          if (part.type === 'finish') {
            log.debug('Finish part:', part);
            const processingTime = (Date.now() - streamStartTime) / 1000;
            return {
              ...baseMetadata,
              completionTime: processingTime,
              totalTokens: part.totalUsage?.totalTokens ?? null,
              inputTokens: part.totalUsage?.inputTokens ?? null,
              outputTokens: part.totalUsage?.outputTokens ?? null,
            };
          }

          return baseMetadata;
        },
      });

      dataStream.merge(
        (specialMode === 'canvas' ? pipeJsonRender(uiMessageStream) : uiMessageStream) as AsyncIterableStream<
          InferUIMessageChunk<ChatMessage>
        >,
      );
    },
    onError(error) {
      if (requestTimeoutTimer) clearTimeout(requestTimeoutTimer);
      log.error('Stream error:', error);
      if (error instanceof Error && error.message.includes('Rate Limit')) {
        return 'Oops, you have reached the rate limit! Please try again later.';
      }
      return 'Oops, an error occurred!';
    },
    onFinish: async ({ messages: streamedMessages, isAborted }: { messages: ChatMessage[]; isAborted: boolean }) => {
      if (requestTimeoutTimer) clearTimeout(requestTimeoutTimer);
      if (!lightweightUser || isTemporaryChat) {
        return;
      }

      const newMessages = streamedMessages.filter((message: ChatMessage) => !initialMessageIds.has(message.id));

      if (newMessages.length === 0) {
        log.info('No new messages to persist for chat', id);
        return;
      }

      // Persist assistant output only for the latest stream on this chat.
      // If a newer request started while this one was running, this prevents
      // stale onFinish writes from older streams from being inserted out of order.
      const latestStreamId = await getLatestStreamIdByChatId({ chatId: id });
      if (latestStreamId !== streamId) {
        log.info('Skipping stale stream message persistence', {
          chatId: id,
          streamId,
          latestStreamId,
        });
        return;
      }

      // Persist only if this response still belongs to the latest user turn.
      // This blocks older in-flight generations from writing a different assistant
      // response after the user has already sent/edited/regenerated a newer turn.
      if (requestLastUserMessageId) {
        const latestUserMessageId = await getLatestUserMessageIdByChatId({ chatId: id });
        if (latestUserMessageId !== requestLastUserMessageId) {
          log.info('Skipping stale turn message persistence', {
            chatId: id,
            streamId,
            requestLastUserMessageId,
            latestUserMessageId,
          });
          return;
        }
      }

      const messagesToPersist = isAborted
        ? newMessages.filter((message: ChatMessage) => {
            if (message.role !== 'assistant') return false;
            if (!Array.isArray(message.parts) || message.parts.length === 0) return false;

            return message.parts.some((part: any) => {
              if (part.type === 'text') return typeof part.text === 'string' && part.text.trim().length > 0;
              if (part.type === 'reasoning') return typeof part.text === 'string' && part.text.trim().length > 0;
              if (part.type === 'tool-invocation') return true;
              if (part.type === 'file') return true;
              if (part.type === 'source-url') return true;
              return false;
            });
          })
        : newMessages;

      if (isAborted && messagesToPersist.length === 0) {
        log.info('Stream aborted with no persistable assistant output', { chatId: id, streamId });
        return;
      }

      await saveMessages({
        messages: messagesToPersist.map((message: ChatMessage) => {
          const attachments = (message as any).experimental_attachments ?? [];
          const createdAt =
            typeof message.metadata?.createdAt === 'string' ? new Date(message.metadata.createdAt) : new Date();

          return {
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt,
            attachments,
            chatId: id,
            model: message.metadata?.model ?? model,
            completionTime: message.metadata?.completionTime ?? finalUsageMetadata.completionTime,
            inputTokens: message.metadata?.inputTokens ?? finalUsageMetadata.inputTokens,
            outputTokens: message.metadata?.outputTokens ?? finalUsageMetadata.outputTokens,
            totalTokens: message.metadata?.totalTokens ?? finalUsageMetadata.totalTokens,
          };
        }),
      });

      // Background memory curator — fire-and-forget, does not block response
      runMemoryCurator({
        messages: messagesToPersist,
        userQueryText,
        userId: lightweightUser.userId,
        preferences: userPreferencesResult?.preferences,
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
