import { describe, it, expect } from 'vitest';
import { placeCompactionSummary } from '@/lib/compaction-summary';
import type { ChatMessage } from '@/lib/types';

function message(id: string, createdAt?: string): ChatMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text: id }],
    ...(createdAt ? { metadata: { createdAt, model: '' } } : {}),
  } as ChatMessage;
}

function summary(createdAt: string): ChatMessage {
  return {
    id: 'summary',
    role: 'assistant',
    parts: [{ type: 'text', text: 'summary' }],
    metadata: { createdAt, model: '', isCompactionSummary: true, compactionReplacedCount: 2 },
  } as ChatMessage;
}

const history = [
  message('m1', '2026-10-14T10:00:00.000Z'),
  message('m2', '2026-10-14T10:01:00.000Z'),
  message('m3', '2026-10-14T10:02:00.000Z'),
  message('m4', '2026-10-14T10:03:00.000Z'),
];

const ids = (messages: ChatMessage[]) => messages.map((m) => m.id);

describe('placeCompactionSummary', () => {
  it('places the summary right after the last message it covers, including a createdAt tie', () => {
    const result = placeCompactionSummary(history, summary('2026-10-14T10:01:00.000Z'));
    expect(ids(result)).toEqual(['m1', 'm2', 'summary', 'm3', 'm4']);
  });

  it('moves an existing summary when the cutoff advances', () => {
    const current = placeCompactionSummary(history, summary('2026-10-14T10:00:00.000Z'));
    const result = placeCompactionSummary(current, summary('2026-10-14T10:02:00.000Z'));
    expect(ids(result)).toEqual(['m1', 'm2', 'm3', 'summary', 'm4']);
  });

  it('keeps messages without a createdAt after the summary', () => {
    const result = placeCompactionSummary([...history, message('streaming')], summary('2026-10-14T10:03:00.000Z'));
    expect(ids(result)).toEqual(['m1', 'm2', 'm3', 'm4', 'summary', 'streaming']);
  });

  it('places the summary first when none of the loaded messages is covered', () => {
    const result = placeCompactionSummary(history.slice(2), summary('2026-10-14T10:01:00.000Z'));
    expect(ids(result)).toEqual(['summary', 'm3', 'm4']);
  });
});
