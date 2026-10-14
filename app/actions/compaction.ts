'use server';

import { getUser } from '@/lib/auth-utils';
import { getChatByIdForValidation, getMessagesByChatId } from '@/lib/db/queries';
import { Message as DbMessage } from '@/lib/db/schema';
import type { ChatMessage } from '@/lib/types';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { maybeCompactContext } from '@/lib/search/context-compaction';
import { resolveContextWindow } from '@/lib/context-window';
import { computeContextBudget, groupIntoTurns, COMPACTION_KEEP_RECENT_TURNS } from '@/lib/search/context-budget';
import { getMaxOutputTokens } from '@/ai/catalog/models';
import { createLogger } from '@/lib/logger';

const log = createLogger('compaction-action');

export type ManualCompactionResult =
  | { success: true; messageId: string; text: string; replacedCount: number; createdAt: string }
  | { success: false; reason: 'not-enough-history' | 'failed' };

// User-triggered equivalent of the automatic compaction in
// app/api/search/route.ts (see lib/search/context-compaction.ts) — same
// pipeline (phase-1 filtering, fold-in selection, tertiary-model
// summarization), just forced regardless of how close the chat is to its
// context budget, so it can be tested/used on demand from the chat header.
export async function manualCompactChat({ chatId, model }: { chatId: string; model: string }): Promise<ManualCompactionResult> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  const owningChat = await getChatByIdForValidation({ id: chatId });
  if (!owningChat || owningChat.userId !== user.id) {
    throw new Error('Unauthorized');
  }

  const [persistedDbMessages, userPreferencesResult] = await Promise.all([
    getMessagesByChatId({ id: chatId, mostRecent: true }),
    getCachedUserPreferencesByUserId(user.id),
  ]);

  const normalizedMessages: ChatMessage[] = (persistedDbMessages as DbMessage[]).map((message) => ({
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
      isCompactionSummary: message.isCompactionSummary,
      compactionReplacedCount: message.compactionReplacedCount ?? null,
    },
  })) as ChatMessage[];

  // Phase 1 (route.ts): drop everything an existing summary already covers.
  const compactionSummaryMessage = normalizedMessages.find((m) => m.metadata?.isCompactionSummary);
  const compactionCutoffTime = compactionSummaryMessage
    ? new Date(compactionSummaryMessage.metadata!.createdAt).getTime()
    : null;
  const hydratedMessages = compactionSummaryMessage
    ? normalizedMessages.filter(
        (m) =>
          m.id === compactionSummaryMessage.id ||
          !m.metadata?.createdAt ||
          new Date(m.metadata.createdAt).getTime() > compactionCutoffTime!,
      )
    : normalizedMessages;

  const { turns } = groupIntoTurns(hydratedMessages);
  if (turns.length <= COMPACTION_KEEP_RECENT_TURNS) {
    return { success: false, reason: 'not-enough-history' };
  }

  const { tokens: contextWindow } = await resolveContextWindow(model, user.id);
  const contextBudget = computeContextBudget(contextWindow, getMaxOutputTokens(model));

  const outcome = await maybeCompactContext({
    chatId,
    hydratedMessages,
    // Forces the threshold check below (estimatedTokens >= contextBudget *
    // COMPACTION_TRIGGER_FRACTION) regardless of the chat's real size —
    // this is the manual, user-requested trigger, not the automatic one.
    estimatedTokens: contextBudget,
    contextBudget,
    preferences: userPreferencesResult?.preferences,
    userId: user.id,
  });

  if (!outcome.ranCompaction || outcome.failed) {
    log.warn(`Manual compaction failed or did not run for chat ${chatId}`);
    return { success: false, reason: 'failed' };
  }

  return {
    success: true,
    messageId: outcome.summaryMessageId,
    text: outcome.text,
    replacedCount: outcome.replacedCount,
    createdAt: outcome.cutoffCreatedAt.toISOString(),
  };
}
