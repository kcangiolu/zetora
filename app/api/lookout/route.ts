import { convertToModelMessages, createUIMessageStream, JsonToSseTransformStream, stepCountIs, streamText } from 'ai';
import type { XaiProviderOptions } from '@ai-sdk/xai';
import { createResumableUIMessageStream } from 'ai-resumable-stream';
import { after } from 'next/server';
import { all } from 'better-all';

import { getTaskModel } from '@/ai/catalog/task-models';
import { resolveTertiaryModel } from '@/ai/tertiary';
import { getBetterAllOptions } from '@/lib/better-all';
import { getLookoutById, getUserById } from '@/lib/db/queries';
import { createLogger } from '@/lib/logger';
import { verifyLookoutRequest } from '@/lib/lookout-auth';
import {
  getResponseText,
  recordLookoutFailure,
  recordLookoutSuccess,
  saveLookoutMessages,
  startLookoutRun,
} from '@/lib/lookout/run-records';
import { getSystemPromptForSearchMode, getToolsForSearchMode } from '@/lib/lookout/search-mode';
import { getResumableStreamClients } from '@/lib/redis';
import type { ChatMessage } from '@/lib/types';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import type { SearchProvider } from '@/lib/search/search-groups';

const log = createLogger('lookout');

const LOOKUP_ATTEMPTS = 3;

// The lookout just scheduled can lag on a replica: retried with backoff (500 ms, 1 s).
async function findLookout(lookoutId: string) {
  for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt++) {
    const lookout = await getLookoutById({ id: lookoutId });
    if (lookout) return lookout;
    if (attempt < LOOKUP_ATTEMPTS) {
      const delay = 500 * 2 ** (attempt - 1);
      log.info(`Lookout not found on attempt ${attempt}, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

// Runs one lookout, called by the scheduler.
export async function POST(req: Request) {
  log.info('🔍 Lookout API endpoint hit by the scheduler');

  // Only the scheduler, holding the shared secret, may run jobs as a lookout's owner.
  const verification = verifyLookoutRequest(req);
  if (!verification.ok) return new Response(verification.message, { status: verification.status });

  const requestStartTime = Date.now();
  try {
    // The job runs as the lookout's stored owner with its stored prompt; the request
    // only names which lookout.
    const { lookoutId } = await req.json();
    log.debug('Running lookout', { lookoutId });

    const lookout = await findLookout(lookoutId);
    if (!lookout) {
      log.error('Lookout not found after', LOOKUP_ATTEMPTS, 'attempts:', lookoutId);
      return new Response('Lookout not found', { status: 404 });
    }

    const { user, userPrefs } = await all(
      {
        async user() {
          return getUserById(lookout.userId);
        },
        async userPrefs() {
          return getCachedUserPreferencesByUserId(lookout.userId);
        },
      },
      getBetterAllOptions(),
    );
    if (!user) {
      log.error('User not found:', lookout.userId);
      return new Response('User not found', { status: 404 });
    }
    const preferences = userPrefs?.preferences ?? {};

    // Lookouts run on the user's "Default Model" pick, else the instance's.
    const modelId = getTaskModel('default', userPrefs?.preferences);
    const { chatId, streamId, userMessage } = await startLookoutRun(lookout, user.id, modelId);
    const initialMessageIds = new Set([userMessage.id]);

    const searchMode = lookout.searchMode || 'extreme';
    log.info('🔍 Using search mode:', searchMode);
    const abortController = new AbortController();

    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer: dataStream }) => {
        const streamStartTime = Date.now();
        const tools = getToolsForSearchMode(
          searchMode,
          dataStream,
          preferences['zetora-search-provider'] as SearchProvider | undefined,
          preferences,
          user.id,
        );
        log.info('🛠️ Active tools:', Object.keys(tools));

        const result = streamText({
          model: await resolveTertiaryModel('default', preferences, user.id),
          messages: await convertToModelMessages([userMessage]),
          stopWhen: stepCountIs(2),
          maxRetries: 10,
          abortSignal: abortController.signal,
          activeTools: Object.keys(tools),
          system: getSystemPromptForSearchMode(searchMode),
          toolChoice: 'auto',
          tools,
          experimental_context: { userPreferences: preferences, userId: user.id },
          providerOptions: { xai: { parallel_function_calling: false } satisfies XaiProviderOptions },
          onChunk(event) {
            if (event.chunk.type === 'tool-call') log.info('Called tool:', event.chunk.toolName);
          },
          onStepFinish(event) {
            if (event.warnings) log.warn('Step warnings:', event.warnings);
          },
          onFinish: async (event) => {
            log.debug('Finished', { finishReason: event.finishReason, steps: event.steps, usage: event.usage });
            if (event.finishReason !== 'stop') return;
            try {
              await recordLookoutSuccess({
                lookout,
                user,
                chatId,
                userMessage,
                durationMs: Date.now() - requestStartTime,
                tokensUsed: event.usage?.totalTokens,
                toolCalls: event.steps.reduce((total, step) => total + (step.toolCalls?.length ?? 0), 0),
                responseText: getResponseText(event.text || '', event.response.messages),
              });
              log.info('Scheduled search completed successfully');
            } catch (error) {
              log.error('Error in onFinish:', error);
            }
          },
          onError: async (event) => {
            log.error('Stream error:', event.error);
            await recordLookoutFailure({
              lookoutId,
              chatId,
              durationMs: Date.now() - requestStartTime,
              error: event.error,
            });
          },
        });

        result.consumeStream();
        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
            messageMetadata: ({ part }) => {
              if (part.type !== 'finish') return undefined;
              return {
                model: modelId,
                completionTime: (Date.now() - streamStartTime) / 1000,
                createdAt: new Date().toISOString(),
                totalTokens: part.totalUsage?.totalTokens ?? null,
                inputTokens: part.totalUsage?.inputTokens ?? null,
                outputTokens: part.totalUsage?.outputTokens ?? null,
              };
            },
          }),
        );
      },
      onError(error) {
        log.error('Stream error:', error);
        return 'Oops, an error occurred in scheduled search!';
      },
      onFinish: async ({ messages }) => {
        await saveLookoutMessages(
          chatId,
          modelId,
          messages.filter((message) => !initialMessageIds.has(message.id)),
        );
      },
    });

    const clients = getResumableStreamClients();
    if (clients) {
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
  } catch (error) {
    log.error('Error in lookout API:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
