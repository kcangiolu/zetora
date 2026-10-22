import { convertToModelMessages, createUIMessageStream, stepCountIs, streamText, type ModelMessage } from 'ai';
import type { XaiProviderOptions } from '@ai-sdk/xai';
import { createResumableUIMessageStream } from 'ai-resumable-stream';
import { all } from 'better-all';

import { getTaskModel } from '@/ai/catalog/task-models';
import { resolveTertiaryModel } from '@/ai/tertiary';
import { getBetterAllOptions } from '@/lib/better-all';
import { claimLookoutRun, getLookoutById, getUserById, releaseLookoutRun, type LookoutStatus } from '@/lib/db/queries';
import { createLogger } from '@/lib/logger';
import { getResumableStreamClients } from '@/lib/redis';
import type { SearchProvider } from '@/lib/search/search-groups';
import { SEARCH_REQUEST_TIMEOUT_MS } from '@/lib/timeouts';
import type { ChatMessage } from '@/lib/types';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';

import {
  getResponseText,
  recordLookoutFailure,
  recordLookoutSuccess,
  saveLookoutMessages,
  startLookoutRun,
} from './run-records';
import { isStaleOnceRun, type LookoutRunRequest } from './schedule';
import { getSystemPromptForSearchMode, getToolsForSearchMode } from './search-mode';

const log = createLogger('lookout');

// A run is a whole search, bounded like a search request.
const LOOKOUT_RUN_TIMEOUT_MS = SEARCH_REQUEST_TIMEOUT_MS;

// A lookout still marked running this long after its run started belongs to a
// run that died (a restart mid-run): the next scheduled run takes over.
const STALE_RUN_MS = LOOKOUT_RUN_TIMEOUT_MS + 5 * 60_000;

type LookoutRow = NonNullable<Awaited<ReturnType<typeof getLookoutById>>>;

/**
 * Runs a lookout and records the result. Skips, without error, a lookout that
 * is gone, rescheduled, paused, archived or already running. Resolves once the
 * run is over; throws only when it could not start, so the scheduler may
 * retry.
 */
export async function runLookout({ lookoutId, runAt, manual = false }: LookoutRunRequest): Promise<'ran' | 'skipped'> {
  const lookout = await getLookoutById({ id: lookoutId });
  if (!lookout) {
    log.warn('Skipping a run of a lookout that no longer exists', { lookoutId });
    return 'skipped';
  }
  if (isStaleOnceRun(lookout, runAt)) {
    log.info('Skipping a one-time run the lookout no longer has', { lookoutId, runAt });
    return 'skipped';
  }

  // The schedule runs active lookouts only; "Test" also runs a paused one.
  const previousStatus = await claimLookoutRun({
    id: lookoutId,
    from: manual ? ['active', 'paused'] : ['active'],
    staleAfterMs: manual ? undefined : STALE_RUN_MS,
  });
  if (!previousStatus) {
    log.info('Skipping a run of a lookout that is not active', { lookoutId, status: lookout.status, manual });
    return 'skipped';
  }

  // A one-time lookout is done after its scheduled run. Otherwise the lookout
  // goes back to the status it had; one taken over from a dead run was active.
  const finalStatus: LookoutStatus =
    !manual && lookout.frequency === 'once' ? 'paused' : previousStatus === 'running' ? 'active' : previousStatus;
  try {
    await executeRun(lookout);
  } catch (error) {
    log.error('Lookout run failed before it could record a result:', error);
  } finally {
    await releaseLookoutRun({ id: lookoutId, status: finalStatus });
  }
  return 'ran';
}

async function executeRun(lookout: LookoutRow): Promise<void> {
  const startedAt = Date.now();
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
  if (!user) throw new Error(`User ${lookout.userId} of lookout ${lookout.id} not found`);
  const preferences = userPrefs?.preferences ?? {};

  // Lookouts run on the user's "Default Model" pick, else the instance's.
  const modelId = getTaskModel('default', userPrefs?.preferences);
  const { chatId, streamId, userMessage } = await startLookoutRun(lookout, user.id, modelId);
  const initialMessageIds = new Set([userMessage.id]);
  const searchMode = lookout.searchMode || 'extreme';

  // Aborted by the timeout, or by the stop button of the chat the run streams to.
  const abortController = new AbortController();
  const timeout = AbortSignal.timeout(LOOKOUT_RUN_TIMEOUT_MS);
  timeout.addEventListener('abort', () => abortController.abort(), { once: true });

  let finished:
    | { finishReason: string; text: string; totalTokens?: number; toolCalls: number; responseMessages: ModelMessage[] }
    | undefined;
  let streamError: unknown;

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
        onFinish(event) {
          finished = {
            finishReason: event.finishReason,
            text: event.text,
            totalTokens: event.totalUsage?.totalTokens,
            toolCalls: event.steps.reduce((total, step) => total + (step.toolCalls?.length ?? 0), 0),
            responseMessages: event.response.messages,
          };
        },
        onError({ error }) {
          streamError = error;
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
      streamError ??= error;
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

  // Nobody reads the run's stream as it happens: it is drained here, through
  // Redis when available so an open chat can follow it live.
  const clients = getResumableStreamClients();
  const output = clients
    ? await (
        await createResumableUIMessageStream({
          streamId,
          publisher: clients.publisher,
          subscriber: clients.subscriber,
          abortController,
        })
      ).startStream(stream)
    : stream;
  try {
    await output.pipeTo(new WritableStream());
  } catch (error) {
    streamError ??= error;
  }

  const durationMs = Date.now() - startedAt;
  if (timeout.aborted) {
    await recordLookoutFailure({
      lookoutId: lookout.id,
      chatId,
      durationMs,
      error: `The run did not finish within ${Math.round(LOOKOUT_RUN_TIMEOUT_MS / 60_000)} minutes`,
      timedOut: true,
    });
  } else if (abortController.signal.aborted) {
    await recordLookoutFailure({ lookoutId: lookout.id, chatId, durationMs, error: 'The run was stopped' });
  } else if (streamError !== undefined || !finished || finished.finishReason === 'error') {
    log.error('Lookout run failed:', streamError);
    await recordLookoutFailure({
      lookoutId: lookout.id,
      chatId,
      durationMs,
      error: streamError ?? 'The model returned no answer',
    });
  } else {
    await recordLookoutSuccess({
      lookout,
      user,
      chatId,
      userMessage,
      durationMs,
      tokensUsed: finished.totalTokens,
      toolCalls: finished.toolCalls,
      responseText: getResponseText(finished.text || '', finished.responseMessages),
    });
    log.info('Lookout run completed', { lookoutId: lookout.id, durationMs });
  }
}
