import { describe, it, expect, vi, beforeEach } from 'vitest';

const { generateText, resolveTertiaryModel, upsertCompactionSummaryMessage } = vi.hoisted(() => ({
  generateText: vi.fn().mockResolvedValue({ text: 'a fresh summary' }),
  resolveTertiaryModel: vi.fn().mockResolvedValue('mock-model'),
  upsertCompactionSummaryMessage: vi.fn().mockResolvedValue({ id: 'summary-1' }),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText };
});
vi.mock('@/ai/tertiary', () => ({ resolveTertiaryModel }));
vi.mock('@/lib/db/queries/chat', () => ({ upsertCompactionSummaryMessage }));

import { maybeCompactContext } from '@/lib/search/context-compaction';
import type { ChatMessage } from '@/lib/types';

function turnMessage(
  id: string,
  role: 'user' | 'assistant',
  text: string,
  createdAt: string,
  extraMetadata?: Record<string, unknown>,
): ChatMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
    metadata: { createdAt, model: '', completionTime: null, inputTokens: null, outputTokens: null, totalTokens: null, ...extraMetadata },
  } as unknown as ChatMessage;
}

// Builds N user+assistant turn pairs, each pair 1 minute apart, starting at
// minute `startMinute`.
function buildTurns(count: number, startMinute = 0): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    const minute = startMinute + i * 2;
    messages.push(turnMessage(`u${i}`, 'user', `question ${i}`, `2026-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`));
    messages.push(
      turnMessage(`a${i}`, 'assistant', `answer ${i}`, `2026-01-01T00:${String(minute + 1).padStart(2, '0')}:00.000Z`),
    );
  }
  return messages;
}

const baseArgs = {
  chatId: 'chat-1',
  contextBudget: 100_000,
  preferences: {} as Record<string, unknown>,
  userId: 'user-1',
};

describe('maybeCompactContext', () => {
  beforeEach(() => {
    generateText.mockClear();
    resolveTertiaryModel.mockClear();
    upsertCompactionSummaryMessage.mockClear();
    generateText.mockResolvedValue({ text: 'a fresh summary' });
    upsertCompactionSummaryMessage.mockResolvedValue({ id: 'summary-1' });
  });

  it('does nothing when the compaction preference is explicitly disabled', async () => {
    const result = await maybeCompactContext({
      ...baseArgs,
      hydratedMessages: buildTurns(10),
      estimatedTokens: 90_000,
      preferences: { 'zetora-tertiary-context-compaction-enabled': false },
    });

    expect(result).toEqual({ ranCompaction: false });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does nothing below the trigger threshold', async () => {
    const result = await maybeCompactContext({
      ...baseArgs,
      hydratedMessages: buildTurns(10),
      estimatedTokens: 79_999, // just under 80% of 100_000
    });

    expect(result).toEqual({ ranCompaction: false });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does nothing when there are no turns older than the kept-recent window', async () => {
    // Only 2 turns total — fewer than COMPACTION_KEEP_RECENT_TURNS (3), so
    // nothing is eligible to fold in even though the budget is exceeded.
    const result = await maybeCompactContext({
      ...baseArgs,
      hydratedMessages: buildTurns(2),
      estimatedTokens: 90_000,
    });

    expect(result).toEqual({ ranCompaction: false });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('folds the oldest turns into a fresh summary, keeping the recent window raw', async () => {
    const messages = buildTurns(6); // 6 turns; last 3 stay raw, first 3 fold in
    const result = await maybeCompactContext({
      ...baseArgs,
      hydratedMessages: messages,
      estimatedTokens: 90_000,
    });

    expect(generateText).toHaveBeenCalledTimes(1);
    const call = generateText.mock.calls[0][0];
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    // No existing summary — the prompt should not contain the "Existing
    // summary" preamble, just the fold-in turns + final instruction.
    expect(call.messages[0].content).not.toContain('Existing summary');

    expect(upsertCompactionSummaryMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      existingMessageId: undefined,
      text: 'a fresh summary',
      replacedCount: 6, // 3 folded turns * 2 messages each
      cutoffCreatedAt: new Date('2026-01-01T00:05:00.000Z'), // end of turn index 2 (a2)
    });

    expect(result).toEqual({
      ranCompaction: true,
      failed: false,
      text: 'a fresh summary',
      replacedCount: 6,
      foldInTurnsCount: 3,
      cutoffCreatedAt: new Date('2026-01-01T00:05:00.000Z'),
      summaryMessageId: 'summary-1',
    });
  });

  it('extends an existing summary incrementally instead of starting over', async () => {
    const existingSummary = turnMessage('summary-0', 'assistant', 'ignored — real text comes from parts below', '2026-01-01T00:03:30.000Z', {
      isCompactionSummary: true,
      compactionReplacedCount: 4,
    });
    existingSummary.parts = [{ type: 'text', text: 'previously: the user discussed X.' }] as any;

    // Two turns already covered (before the summary's cutoff, would already
    // have been filtered out by route.ts phase 1 in real usage) — here we
    // only pass what phase 1 would have left: the summary + turns after it.
    const laterTurns = buildTurns(5, 4); // 5 fresh turns starting after the cutoff
    const messages = [existingSummary, ...laterTurns];

    const result = await maybeCompactContext({
      ...baseArgs,
      hydratedMessages: messages,
      estimatedTokens: 90_000,
    });

    const call = generateText.mock.calls[0][0];
    expect(call.messages[0].content).toContain('previously: the user discussed X.');

    expect(upsertCompactionSummaryMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        existingMessageId: 'summary-0',
        replacedCount: 4 + 4, // existing 4 + 2 folded turns * 2 messages
      }),
    );
    expect(result).toMatchObject({ ranCompaction: true, failed: false, replacedCount: 8, foldInTurnsCount: 2 });
  });

  it('falls back to a failed outcome instead of throwing when the LLM call errors', async () => {
    generateText.mockRejectedValueOnce(new Error('model unreachable'));

    const result = await maybeCompactContext({
      ...baseArgs,
      hydratedMessages: buildTurns(6),
      estimatedTokens: 90_000,
    });

    expect(result).toEqual({ ranCompaction: true, failed: true });
    expect(upsertCompactionSummaryMessage).not.toHaveBeenCalled();
  });
});
