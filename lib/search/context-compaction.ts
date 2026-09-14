import 'server-only';

import { generateText, convertToModelMessages, type ModelMessage } from 'ai';
import type { ChatMessage } from '@/lib/types';
import { resolveTertiaryModel } from '@/ai/tertiary';
import { groupIntoTurns, COMPACTION_TRIGGER_FRACTION, COMPACTION_KEEP_RECENT_TURNS } from '@/lib/search/context-budget';
import { upsertCompactionSummaryMessage } from '@/lib/db/queries/chat';
import { createLogger } from '@/lib/logger';

const log = createLogger('context-compaction');

// Synchronous by design (see app/api/search/route.ts) — must not hang the
// request it's blocking. No existing tertiary task (chat-title, followup,
// memory-curator) times out today since none of them sit in the critical
// path the way this one does.
const COMPACTION_TIMEOUT_MS = 20_000;

export const COMPACTION_SYSTEM_PROMPT = `You are a conversation summarizer for a chat assistant. You will be given: (1) an existing summary of earlier conversation, if any, and (2) additional conversation turns that need to be folded into that summary because the conversation is getting too long for the assistant's context window.

Produce ONE updated, coherent summary that:
- Preserves every fact, decision, instruction, and constraint from the existing summary — never drop or contradict anything already summarized.
- Integrates the new turns' important content (what the user asked, what was concluded, any commitments made, preferences stated, facts established).
- Is written in plain prose, third person ("the user asked...", "the assistant found..."), not a transcript.
- Omits pleasantries, filler, and content that has no bearing on the rest of the conversation.
- Is as concise as possible while losing no information a later turn might depend on.

Output ONLY the updated summary text, nothing else — no preamble, no headers.`;

export type CompactionOutcome =
  | { ranCompaction: false }
  | { ranCompaction: true; failed: true }
  | {
      ranCompaction: true;
      failed: false;
      text: string;
      replacedCount: number;
      foldInTurnsCount: number;
      cutoffCreatedAt: Date;
      summaryMessageId: string;
    };

// Summarizes the oldest turns of a conversation into a single, incrementally
// extended assistant message (see message.isCompactionSummary in
// lib/db/schema.ts) instead of letting pruneToContextBudget()
// (lib/search/context-budget.ts) drop them outright. `hydratedMessages` must
// already have phase-1 filtering applied (app/api/search/route.ts — messages
// already covered by an existing summary excluded), and `estimatedTokens`
// measured on that same (already-filtered) set converted for the model.
export async function maybeCompactContext({
  chatId,
  hydratedMessages,
  estimatedTokens,
  contextBudget,
  preferences,
  userId,
}: {
  chatId: string;
  hydratedMessages: ChatMessage[];
  estimatedTokens: number;
  contextBudget: number;
  preferences: Record<string, unknown> | null | undefined;
  userId?: string;
}): Promise<CompactionOutcome> {
  if (preferences?.['zetora-tertiary-context-compaction-enabled'] === false) {
    return { ranCompaction: false };
  }
  if (contextBudget <= 0 || estimatedTokens < contextBudget * COMPACTION_TRIGGER_FRACTION) {
    return { ranCompaction: false };
  }

  const existingSummary = hydratedMessages.find((m) => m.metadata?.isCompactionSummary);
  const summaryTextPart = existingSummary?.parts.find((part) => part.type === 'text');
  const existingSummaryText = summaryTextPart && summaryTextPart.type === 'text' ? summaryTextPart.text : undefined;

  // groupIntoTurns anchors on 'user' messages — the existing summary (role
  // assistant, no preceding 'user' message since phase-1 filtering already
  // puts it first) falls into pinnedPrefix, never treated as a foldable turn.
  const { turns } = groupIntoTurns(hydratedMessages);
  const foldInTurns = turns.slice(0, Math.max(0, turns.length - COMPACTION_KEEP_RECENT_TURNS));
  if (foldInTurns.length === 0) {
    return { ranCompaction: false };
  }

  const foldInMessages = foldInTurns.flat();
  const lastFoldInMessage = foldInMessages[foldInMessages.length - 1];
  const cutoffCreatedAt = new Date(lastFoldInMessage.metadata?.createdAt ?? Date.now());

  try {
    const convertedFoldIn = await convertToModelMessages(foldInMessages, { ignoreIncompleteToolCalls: true });
    const promptMessages: ModelMessage[] = [
      ...(existingSummaryText
        ? [
            { role: 'user' as const, content: `Existing summary of the conversation so far:\n\n${existingSummaryText}` },
            {
              role: 'assistant' as const,
              content: 'Understood — I will preserve this and extend it with the new turns.',
            },
          ]
        : []),
      { role: 'user' as const, content: 'Here are the additional conversation turns to fold in:' },
      ...convertedFoldIn,
      { role: 'user' as const, content: 'Now produce the single updated summary, per your instructions.' },
    ];

    const { text } = await generateText({
      model: await resolveTertiaryModel('context-compaction', (preferences as Record<string, string>) ?? null, userId),
      system: COMPACTION_SYSTEM_PROMPT,
      messages: promptMessages,
      abortSignal: AbortSignal.timeout(COMPACTION_TIMEOUT_MS),
    });

    const replacedCount = (existingSummary?.metadata?.compactionReplacedCount ?? 0) + foldInMessages.length;

    const savedMessage = await upsertCompactionSummaryMessage({
      chatId,
      existingMessageId: existingSummary?.id,
      text,
      replacedCount,
      cutoffCreatedAt,
    });

    if (!savedMessage) {
      throw new Error('upsertCompactionSummaryMessage returned no row');
    }

    return {
      ranCompaction: true,
      failed: false,
      text,
      replacedCount,
      foldInTurnsCount: foldInTurns.length,
      cutoffCreatedAt,
      summaryMessageId: savedMessage.id,
    };
  } catch (error) {
    log.error('Context compaction failed:', error);
    return { ranCompaction: true, failed: true };
  }
}
