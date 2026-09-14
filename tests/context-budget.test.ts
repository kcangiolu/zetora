import { describe, it, expect } from 'vitest';
import type { ModelMessage } from 'ai';
import {
  estimateTokenCount,
  computeContextBudget,
  pruneToContextBudget,
  isContextLengthError,
  groupIntoTurns,
} from '@/lib/search/context-budget';

function user(content: string): ModelMessage {
  return { role: 'user', content };
}

function assistant(content: string): ModelMessage {
  return { role: 'assistant', content };
}

function toolResult(): ModelMessage {
  return {
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'demo', output: { type: 'text', value: 'ok' } }],
  } as unknown as ModelMessage;
}

function system(content: string): ModelMessage {
  return { role: 'system', content };
}

describe('estimateTokenCount', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('applies the chars/4 heuristic with a 20% safety margin for strings', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokenCount(text)).toBe(Math.ceil((400 / 4) * 1.2));
  });

  it('sums the JSON-stringified size of every message', () => {
    const messages = [user('hello'), assistant('world')];
    const charCount = JSON.stringify(messages[0]).length + JSON.stringify(messages[1]).length;
    expect(estimateTokenCount(messages)).toBe(Math.ceil((charCount / 4) * 1.2));
  });

  it('never throws on a message with a circular reference', () => {
    const circular: any = { role: 'user', content: 'x' };
    circular.self = circular;
    expect(() => estimateTokenCount([circular])).not.toThrow();
    expect(estimateTokenCount([circular])).toBe(0);
  });

  it('adds a flat per-image surcharge on top of the char-based estimate', () => {
    // Images are stored as hosted URLs, not inlined base64 — so a bare
    // char-count would treat this message as ~free even though it costs
    // real vision tokens once sent to the model.
    const withoutImage = [user('hi')];
    const withImage: ModelMessage[] = [
      { role: 'user', content: [{ type: 'image', image: 'https://x/pic.png', mediaType: 'image/png' }] } as any,
    ];
    expect(estimateTokenCount(withImage)).toBeGreaterThan(estimateTokenCount(withoutImage) + 1000);
  });

  it('counts an image file part the same as an image content part', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: [{ type: 'file', mediaType: 'image/png', url: 'https://x/pic.png' }] } as any,
    ];
    expect(estimateTokenCount(messages)).toBeGreaterThan(1000);
  });
});

describe('computeContextBudget', () => {
  it('reserves 20% headroom on top of the output reserve', () => {
    // outputReserve (8_000) is under half of contextWindow (128_000), so the
    // clamp is a no-op here — full reserve counts as-is.
    expect(computeContextBudget(128_000, 8_000)).toBe(Math.floor((128_000 - 8_000) * 0.8));
  });

  it('never goes negative even after the output reserve is clamped', () => {
    // effectiveReserve = min(8_000, floor(4_096 * 0.5)) = 2_048
    expect(computeContextBudget(4_096, 8_000)).toBe(Math.floor((4_096 - 2_048) * 0.8));
  });

  it('still floors at 0 when the clamped reserve alone exceeds the context window', () => {
    expect(computeContextBudget(0, 8_000)).toBe(0);
  });

  it('caps the output reserve at half the context window instead of letting it eat the whole budget', () => {
    // Real-world regression case: a custom OpenAI-compatible provider (e.g.
    // OpenRouter) with an undetected context window (8_192 default) and the
    // generic 8_000-token maxOutputTokens fallback used to collapse the
    // budget to ~153 tokens. The reserve is now capped at 8_192 * 0.5 = 4_096.
    expect(computeContextBudget(8_192, 8_000)).toBe(Math.floor((8_192 - 4_096) * 0.8));
    expect(computeContextBudget(8_192, 8_000)).toBeGreaterThan(3_000);
  });
});

describe('groupIntoTurns', () => {
  it('puts everything before the first user message in pinnedPrefix, not a turn', () => {
    const messages = [system('you are helpful'), user('hi'), assistant('hello')];
    const { pinnedPrefix, turns } = groupIntoTurns(messages);
    expect(pinnedPrefix).toEqual([messages[0]]);
    expect(turns).toEqual([[messages[1], messages[2]]]);
  });

  it('groups a user message plus everything up to the next user message as one turn', () => {
    const messages = [user('turn 1'), assistant('reply 1'), toolResult(), user('turn 2'), assistant('reply 2')];
    const { pinnedPrefix, turns } = groupIntoTurns(messages);
    expect(pinnedPrefix).toEqual([]);
    expect(turns).toEqual([
      [messages[0], messages[1], messages[2]],
      [messages[3], messages[4]],
    ]);
  });

  it('returns no turns and the whole array as pinnedPrefix when there is no user message', () => {
    const messages = [system('you are helpful'), assistant('hello')];
    const { pinnedPrefix, turns } = groupIntoTurns(messages);
    expect(pinnedPrefix).toEqual(messages);
    expect(turns).toEqual([]);
  });

  it('works generically on richer objects (e.g. ChatMessage-shaped with id/metadata)', () => {
    const messages = [
      { role: 'user', id: 'u1', metadata: { createdAt: 't1' } },
      { role: 'assistant', id: 'a1', metadata: { createdAt: 't2' } },
    ];
    const { turns } = groupIntoTurns(messages);
    expect(turns).toEqual([messages]);
  });
});

describe('pruneToContextBudget', () => {
  it('leaves messages untouched when already under budget', () => {
    const messages = [user('hi'), assistant('hello')];
    const result = pruneToContextBudget(messages, 10_000);
    expect(result.turnsRemoved).toBe(0);
    expect(result.messages).toEqual(messages);
  });

  it('drops the oldest turns first, one whole turn at a time', () => {
    const messages = [
      user('turn 1 '.repeat(50)),
      assistant('reply 1 '.repeat(50)),
      user('turn 2 '.repeat(50)),
      assistant('reply 2 '.repeat(50)),
    ];
    const fullSize = estimateTokenCount(messages);
    const budget = Math.floor(fullSize * 0.6); // fits one turn but not two

    const result = pruneToContextBudget(messages, budget);

    expect(result.turnsRemoved).toBe(1);
    expect(result.messages).toEqual([messages[2], messages[3]]);
  });

  it('never drops a system-prefix message', () => {
    const messages = [
      system('you are helpful'),
      user('turn 1 '.repeat(50)),
      assistant('reply 1 '.repeat(50)),
      user('turn 2'),
    ];
    const budget = estimateTokenCount([system('you are helpful'), user('turn 2')]) + 5;

    const result = pruneToContextBudget(messages, budget);

    expect(result.messages[0]).toEqual(messages[0]);
    expect(result.messages).toContainEqual(messages[3]);
  });

  it('drops a tool-call/tool-result block as one atomic turn, never leaving an orphaned tool message', () => {
    const messages = [user('turn 1 '.repeat(50)), assistant('calling a tool'), toolResult(), user('turn 2')];
    const fullSize = estimateTokenCount(messages);
    const budget = Math.floor(fullSize * 0.3); // only the last turn fits

    const result = pruneToContextBudget(messages, budget);

    expect(result.turnsRemoved).toBe(1);
    expect(result.messages).toEqual([messages[3]]);
    expect(result.messages.some((m) => m.role === 'tool')).toBe(false);
  });

  it('always keeps the most recent turn even if it alone still exceeds the budget', () => {
    const messages = [user('a'.repeat(1000))];
    const result = pruneToContextBudget(messages, 1);

    expect(result.turnsRemoved).toBe(0);
    expect(result.messages).toEqual(messages);
    expect(result.estimatedTokensAfter).toBeGreaterThan(1);
  });

  it('subtracts reservedTokens from the usable budget', () => {
    const messages = [user('turn 1 '.repeat(50)), assistant('reply 1 '.repeat(50)), user('turn 2')];
    const fullSize = estimateTokenCount(messages);

    const withoutReserve = pruneToContextBudget(messages, fullSize);
    const withReserve = pruneToContextBudget(messages, fullSize, fullSize);

    expect(withoutReserve.turnsRemoved).toBe(0);
    expect(withReserve.turnsRemoved).toBeGreaterThan(0);
  });
});

describe('isContextLengthError', () => {
  it.each([
    "This model's maximum context length is 8192 tokens",
    'context_length_exceeded',
    'the request exceeds the available context size',
    'prompt is too long: 200000 tokens > 100000 maximum',
    'Please reduce the length of the messages',
    'too many tokens in the request',
  ])('detects provider message: %s', (message) => {
    expect(isContextLengthError(new Error(message))).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isContextLengthError(new Error('Network timeout'))).toBe(false);
  });

  it('checks responseBody when the message itself is generic', () => {
    const error = Object.assign(new Error('Request failed with status code 400'), {
      responseBody: JSON.stringify({ error: { message: 'context_length_exceeded' } }),
    });
    expect(isContextLengthError(error)).toBe(true);
  });
});
