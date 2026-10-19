import type { ModelMessage, UIMessageStreamWriter } from 'ai';

import { getMaxOutputTokens } from '@/ai/catalog/models';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';
import type { ChatMessage } from '@/lib/types';

import { computeContextBudget, estimateTokenCount, groupIntoTurns, pruneToContextBudget } from './context-budget';
import { maybeCompactContext } from './context-compaction';
import {
  reconcileImageReferencesAfterPruning,
  type ContextImageRef,
  type GeneratedImageRef,
} from './message-attachments';

const log = createLogger('search');

export interface ImageReferences {
  // The image instruction added to the last user message, if any.
  instruction: string | null;
  uploaded: ContextImageRef[];
  generated: GeneratedImageRef[];
  visionEnabled: boolean;
}

// Fits the history into the model's context window. When it is too long, the oldest
// turns are first summarized (context compaction, phase 2), then dropped if still too
// long. The client is told what happened through transient data parts.
export async function fitToContextBudget({
  messages,
  conversation,
  model,
  contextWindow,
  systemPrompt,
  chatId,
  isTemporaryChat,
  preferences,
  userId,
  images,
  dataStream,
}: {
  // The history as the model gets it, one entry per message of `conversation`.
  messages: ModelMessage[];
  conversation: ChatMessage[];
  model: string;
  contextWindow: number;
  systemPrompt: string;
  chatId: string;
  isTemporaryChat: boolean;
  preferences: UserPreferenceValues | undefined;
  userId: string | undefined;
  images: ImageReferences;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Promise<{ messages: ModelMessage[]; contextBudget: number }> {
  const contextBudget = computeContextBudget(contextWindow, getMaxOutputTokens(model));

  const compaction = isTemporaryChat
    ? ({ ranCompaction: false } as const)
    : await maybeCompactContext({
        chatId,
        hydratedMessages: conversation,
        estimatedTokens: estimateTokenCount(messages),
        contextBudget,
        preferences,
        userId,
      });

  let toPrune = messages;
  let foldedTurns = 0;
  if (compaction.ranCompaction && !compaction.failed) {
    // Pruning never removes a user message, so turns line up between the conversation
    // and `messages`: the first N here are the ones just summarized. Swapping them for
    // the summary lets this turn benefit already, not only the next.
    const { turns } = groupIntoTurns(messages);
    foldedTurns = compaction.foldInTurnsCount;
    toPrune = [{ role: 'assistant', content: compaction.text }, ...turns.slice(foldedTurns).flat()];
    log.info(`📝 Context compaction: folded ${foldedTurns} turn(s) into a ${compaction.replacedCount}-message summary`);
    dataStream.write({
      type: 'data-compaction_summary',
      data: {
        messageId: compaction.summaryMessageId,
        text: compaction.text,
        replacedCount: compaction.replacedCount,
        createdAt: compaction.cutoffCreatedAt.toISOString(),
      },
      transient: true,
    });
  } else if (compaction.ranCompaction && compaction.failed) {
    dataStream.write({
      type: 'data-context_compaction_warning',
      data: { message: 'Context compaction failed — falling back to trimming the oldest messages from this response.' },
      transient: true,
    });
  }

  const { messages: budgeted, turnsRemoved } = pruneToContextBudget(
    toPrune,
    contextBudget,
    estimateTokenCount(systemPrompt),
  );
  if (turnsRemoved > 0) {
    log.info(
      `✂️ Context-budget pruning: removed ${turnsRemoved} oldest turn(s) (contextWindow=${contextWindow}, budget=${contextBudget})`,
    );
    dataStream.write({
      type: 'data-context_excluded_count',
      data: { count: toPrune.length - budgeted.length },
      transient: true,
    });
  }

  // The image instruction of the last user message was built from the whole history:
  // it must not call an image "shown above" once its turn is gone.
  if ((turnsRemoved > 0 || foldedTurns > 0) && images.instruction) {
    reconcileImageReferencesAfterPruning({
      messages: budgeted,
      turnsRemoved: turnsRemoved + foldedTurns,
      contextUploadedImages: images.uploaded,
      contextGeneratedImages: images.generated,
      visionEnabled: images.visionEnabled,
      previousImageInstruction: images.instruction,
    });
  }

  return { messages: budgeted, contextBudget };
}
