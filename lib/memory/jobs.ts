import 'server-only';

import { generateText, Output, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import { resolveTertiaryModel } from '@/ai/tertiary';
import { ModelUnavailableError } from '@/ai/catalog/task-models';
import {
  applyMemoryConsolidation,
  applyMemoryMutations,
  expireMemoryEntries,
  getUserBio,
  listMemoryEntries,
  markMemoryConsolidated,
  saveUserBioText,
} from '@/lib/db/queries/memory';
import type { MemoryEntry } from '@/lib/db/schema';
import { DURABILITY_UNUSED_TTL_DAYS, MEMORY_DURABILITIES, MEMORY_LIMITS } from './constants';
import { buildConsolidationPrompt, consolidationSchema, planConsolidation } from './consolidation-plan';
import { memoryOpsSchema, planMemoryMutations, type MemoryMutation, type MemoryOp, type MemoryOrigin } from './ops';
import { buildTurnUpdateInstruction } from './prompt';
import { hasDedicatedMemoryModel, isAutoMemoryEnabled } from './settings';
import { selectRelevantEntries } from './text-match';

import { createLogger } from '@/lib/logger';
import type { UserPreferenceValues } from '@/lib/db/schema';

const log = createLogger('memory');

type Preferences = UserPreferenceValues | null | undefined;

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_CANDIDATES_MAX = 30;
const REVIEW_RELEVANT_MAX = 15;

// Groq's strict JSON Schema mode rejects schemas with nullable/optional
// fields outright; no-op for every other provider.
const STRUCTURED_OUTPUT_PROVIDER_OPTIONS = { groq: { strictJsonSchema: false } };

// The entries shown to the model so it can update, confirm or archive them
// (and not re-add them): core facts, open candidates, and whatever relates to
// this exchange. Sensitive entries are never sent to a model.
function selectEntriesToReview(entries: MemoryEntry[], turnText: string): MemoryEntry[] {
  const visible = entries.filter((e) => !e.sensitive);
  const always = visible.filter((e) => e.status === 'confirmed' && e.tier === 'always');
  const candidates = visible.filter((e) => e.status === 'candidate').slice(0, REVIEW_CANDIDATES_MAX);
  const relevant = selectRelevantEntries(
    visible.filter((e) => e.status === 'confirmed' && e.tier === 'contextual'),
    turnText,
    REVIEW_RELEVANT_MAX,
  );
  return [...new Map([...always, ...candidates, ...relevant].map((e) => [e.id, e])).values()];
}

// The update request for a model that only gets the exchange as text, not the
// conversation it came from: the dedicated Memory model, or Hermes's own.
export async function buildStandaloneTurnPrompt(userId: string, turnText: string): Promise<string> {
  const entries = await listMemoryEntries(userId);
  const instruction = buildTurnUpdateInstruction(selectEntriesToReview(entries, turnText));
  return `<conversation>\n${turnText}\n</conversation>\n\n${instruction}`;
}

export async function applyMemoryOps(userId: string, origin: MemoryOrigin, ops: MemoryOp[]): Promise<MemoryMutation[]> {
  const mutations = await applyMemoryMutations(userId, origin, (current) => planMemoryMutations(ops, current, origin));
  log.info('Memory turn update', { proposed: ops.length, applied: mutations.map((m) => m.kind) });
  return mutations;
}

/**
 * The turn update on the dedicated Memory model, for a turn whose own model
 * Zetora cannot call. Throws ModelUnavailableError when none is picked.
 */
export async function runDedicatedMemoryTurnUpdate({
  userId,
  origin,
  preferences,
  turnText,
}: {
  userId: string;
  origin: MemoryOrigin;
  preferences: Preferences;
  turnText: string;
}): Promise<void> {
  const { output } = await generateText({
    model: await resolveTertiaryModel('memory-curator', preferences ?? null, userId),
    prompt: await buildStandaloneTurnPrompt(userId, turnText),
    output: Output.object({ schema: memoryOpsSchema }),
    providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
    maxRetries: 1,
  });
  await applyMemoryOps(userId, origin, output.ops);
  await maybeConsolidateMemory(userId, preferences);
}

export interface ChatTurnRequest {
  model: LanguageModel;
  system: string;
  // Everything the model saw for the answer, followed by the answer itself.
  messages: ModelMessage[];
  tools?: ToolSet;
  activeTools?: string[];
  providerOptions?: Parameters<typeof generateText>[0]['providerOptions'];
}

/**
 * Runs after every finished chat answer: asks a model which memory changes
 * the last exchange calls for, then applies them through planMemoryMutations.
 * By default the conversation's own model does it, with the exact request
 * that produced the answer plus one instruction at the end — the long prefix
 * is then served from the provider's prompt cache. A dedicated model, when
 * picked in Settings, only gets the exchange as text instead.
 * Fire-and-forget: never throws, never delays the response.
 */
export function runMemoryTurnUpdate({
  userId,
  chatId,
  preferences,
  turnText,
  chatRequest,
}: {
  userId: string;
  chatId: string;
  preferences: Preferences;
  turnText: string;
  chatRequest: ChatTurnRequest;
}): void {
  if (!isAutoMemoryEnabled(preferences) || !turnText.trim()) return;
  const origin: MemoryOrigin = { chatId, sessionId: null };

  (async () => {
    if (hasDedicatedMemoryModel(preferences)) {
      await runDedicatedMemoryTurnUpdate({ userId, origin, preferences, turnText });
      return;
    }

    const entries = await listMemoryEntries(userId);
    const instruction = buildTurnUpdateInstruction(selectEntriesToReview(entries, turnText));
    const { output, usage } = await generateText({
      model: chatRequest.model,
      system: chatRequest.system,
      messages: [...chatRequest.messages, { role: 'user', content: instruction }] satisfies ModelMessage[],
      // Same tool definitions as the answer, so the cached prefix still
      // matches; 'none' keeps the model from calling any of them.
      tools: chatRequest.tools,
      activeTools: chatRequest.activeTools,
      toolChoice: 'none',
      providerOptions: { ...chatRequest.providerOptions, ...STRUCTURED_OUTPUT_PROVIDER_OPTIONS },
      output: Output.object({ schema: memoryOpsSchema }),
      maxRetries: 1,
    });
    log.info('Memory turn update usage', {
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
    });

    await applyMemoryOps(userId, origin, output.ops);
    await maybeConsolidateMemory(userId, preferences, chatRequest.model);
  })().catch((error) => log.error('Memory turn update failed:', error instanceof Error ? error.message : error));
}

// On globalThis so that every bundle that imports this module (chat route,
// settings action) sees the same in-flight set.
const consolidatingUsers = ((globalThis as { __zetoraConsolidatingUsers?: Set<string> }).__zetoraConsolidatingUsers ??=
  new Set<string>());

function requireChatModel(chatModel: LanguageModel | undefined): LanguageModel {
  if (!chatModel) {
    throw new ModelUnavailableError(
      'Memory: tidying up on demand needs a Memory model. Pick one in Settings → AI Models.',
    );
  }
  return chatModel;
}

// Weekly consolidation, started lazily from the turn update rather than by a
// scheduler: memory only changes while the user chats, so there is nothing to
// tidy for users who don't. Without a dedicated Memory model it needs the
// chat model of the turn, so a turn Zetora did not answer leaves it for later.
async function maybeConsolidateMemory(userId: string, preferences: Preferences, chatModel?: LanguageModel) {
  if (!chatModel && !hasDedicatedMemoryModel(preferences)) return;
  const bio = await getUserBio(userId);
  const last = bio?.consolidatedAt?.getTime() ?? 0;
  if (Date.now() - last < MEMORY_LIMITS.consolidationIntervalDays * DAY_MS) return;
  await runMemoryConsolidation(userId, preferences, chatModel);
}

/**
 * Tidies a user's memory: deterministic expiry first, then one model call
 * that merges duplicates, rewrites unclear entries, re-tiers them and
 * regenerates the learned part of the bio. Only reads the memory itself,
 * never conversations. Runs on the dedicated Memory model when one is picked,
 * else on the chat model of the turn that started it. Returns false when
 * skipped because one is running.
 */
export async function runMemoryConsolidation(
  userId: string,
  preferences: Preferences,
  chatModel?: LanguageModel,
): Promise<boolean> {
  if (consolidatingUsers.has(userId)) return false;
  consolidatingUsers.add(userId);
  try {
    // Resolved first: without a model, nothing is touched.
    const model = hasDedicatedMemoryModel(preferences)
      ? await resolveTertiaryModel('memory-curator', preferences ?? null, userId)
      : requireChatModel(chatModel);

    // Marked up front: a failing model call must wait for the next interval,
    // not be retried after every single message.
    await markMemoryConsolidated(userId);

    const now = Date.now();
    await expireMemoryEntries(userId, {
      candidateCutoff: new Date(now - MEMORY_LIMITS.candidateTtlDays * DAY_MS),
      unusedCutoffs: MEMORY_DURABILITIES.flatMap((durability) => {
        const ttlDays = DURABILITY_UNUSED_TTL_DAYS[durability];
        return ttlDays === null ? [] : [{ durability, cutoff: new Date(now - ttlDays * DAY_MS) }];
      }),
    });

    const [bio, allEntries] = await Promise.all([getUserBio(userId), listMemoryEntries(userId)]);
    const entries = allEntries.filter((e) => e.status === 'confirmed' && !e.sensitive);

    if (entries.length > 0) {
      const { output } = await generateText({
        model,
        prompt: buildConsolidationPrompt({
          entries,
          bioUserText: bio?.userText ?? '',
          bioAutoText: bio?.autoText ?? '',
          autoTextEditedByUser: Boolean(bio?.autoEditedByUserAt),
        }),
        output: Output.object({ schema: consolidationSchema }),
        providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
        maxRetries: 1,
      });

      const plan = planConsolidation(output, entries);
      await applyMemoryConsolidation(userId, plan);
      if (plan.bio) await saveUserBioText(userId, 'autoText', plan.bio, 'consolidation');
      log.info('Memory consolidated', { updated: plan.updates.length, deleted: plan.deleteIds.length });
    }
    return true;
  } finally {
    consolidatingUsers.delete(userId);
  }
}
