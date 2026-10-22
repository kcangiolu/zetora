import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/queries', () => ({}));

import { buildConversation, getLastUserText } from '@/lib/search/conversation-history';
import { buildDateTimeContext } from '@/lib/search/date-time-context';
import { selectPersistableMessages } from '@/lib/search/persist-stream-messages';
import { getStreamErrorMessage } from '@/lib/search/stream-errors';
import { usageFromSteps, usageFromTotal } from '@/lib/search/stream-usage';
import type { Message as DbMessage } from '@/lib/db/schema';
import type { ChatMessage } from '@/lib/types';

const user = (id: string, text: string, createdAt?: string): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
  ...(createdAt ? { metadata: { createdAt } as ChatMessage['metadata'] } : {}),
});

const dbMessage = (id: string, role: string, createdAt: string, extra: Partial<DbMessage> = {}): DbMessage =>
  ({
    id,
    role,
    parts: [{ type: 'text', text: id }],
    createdAt: new Date(createdAt),
    model: 'm',
    isCompactionSummary: false,
    ...extra,
  }) as DbMessage;

describe('buildConversation', () => {
  it('reads a saved chat back from the database and adds the new message once', () => {
    const { all, newIncoming } = buildConversation({
      persisted: [dbMessage('u1', 'user', '2026-01-01'), dbMessage('a1', 'assistant', '2026-01-02')],
      incoming: [user('u2', 'next')],
      isTemporaryChat: false,
    });
    expect(all.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
    expect(newIncoming.map((m) => m.id)).toEqual(['u2']);
  });

  it('keeps what a temporary chat sends', () => {
    const incoming = [user('u1', 'a'), user('u2', 'b')];
    expect(buildConversation({ persisted: [], incoming, isTemporaryChat: true }).all).toBe(incoming);
  });

  it('leaves out the messages a compaction summary replaced', () => {
    const { all, active } = buildConversation({
      persisted: [
        dbMessage('old', 'user', '2026-01-01'),
        dbMessage('summary', 'assistant', '2026-01-02', { isCompactionSummary: true }),
        dbMessage('recent', 'user', '2026-01-03'),
      ],
      incoming: [user('new', 'hi')],
      isTemporaryChat: false,
    });
    expect(all).toHaveLength(4);
    expect(active.map((m) => m.id)).toEqual(['summary', 'recent', 'new']);
  });
});

describe('getLastUserText', () => {
  it('skips user messages without text', () => {
    const imageOnly: ChatMessage = { id: 'u2', role: 'user', parts: [] };
    expect(getLastUserText([user('u1', 'first question'), imageOnly])).toBe('first question');
  });
});

describe('buildDateTimeContext', () => {
  const now = new Date('2026-10-19T12:00:00Z');

  it('uses the user time zone', () => {
    expect(buildDateTimeContext('Asia/Tokyo', now)).toContain('(Asia/Tokyo)');
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(buildDateTimeContext('Not/AZone', now)).toBe('\n\nCurrent date and time (UTC): 2026-10-19T12:00:00.000Z.');
  });
});

describe('usage', () => {
  it('adds input and output when the provider gave no total', () => {
    expect(usageFromTotal({ inputTokens: 10, outputTokens: 5 }, 1)).toEqual({
      completionTime: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it('sums the steps of an aborted answer', () => {
    expect(
      usageFromSteps([{ usage: { inputTokens: 10, totalTokens: 12 } }, { usage: { inputTokens: 3 } }, {}], 2),
    ).toEqual({
      completionTime: 2,
      inputTokens: 13,
      outputTokens: null,
      totalTokens: 12,
    });
  });
});

describe('selectPersistableMessages', () => {
  it('keeps only stopped answers with content', () => {
    const empty: ChatMessage = { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '  ' }] };
    const partial: ChatMessage = { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Half an' }] };
    expect(selectPersistableMessages([empty, partial], true)).toEqual([partial]);
    expect(selectPersistableMessages([empty], false)).toEqual([empty]);
  });

  it('keeps a stopped answer that has only a tool call or a canvas spec', () => {
    const toolOnly: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'dynamic-tool', toolName: 'mcp_search', toolCallId: 't1', state: 'input-available', input: {} }],
    };
    const specOnly: ChatMessage = {
      id: 'a2',
      role: 'assistant',
      parts: [{ type: 'data-spec', data: { type: 'patch', patch: { op: 'add', path: '/root', value: 'r' } } }],
    };
    expect(selectPersistableMessages([toolOnly, specOnly], true)).toEqual([toolOnly, specOnly]);
  });
});

describe('getStreamErrorMessage', () => {
  it('names rate limits and hides other errors', () => {
    expect(getStreamErrorMessage(new Error('Rate Limit exceeded'))).toContain('rate limit');
    expect(getStreamErrorMessage(new Error('secret upstream detail'))).toBe('Oops, an error occurred!');
  });
});
