import { describe, it, expect } from 'vitest';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { morphXmlProtocol } from '@ai-sdk-tool/parser';
import { hoistSystemMessagesToFront, normalizeTextBoundaries } from '@/ai/xml-tool-middleware';

const m = (role: string, tag = '') => ({ role, tag });

describe('hoistSystemMessagesToFront', () => {
  it('moves a trailing system message to the front (morph appends it there)', () => {
    // morphXmlToolMiddleware produces [user, system] when there is no leading system
    const out = hoistSystemMessagesToFront([m('user', 'u1'), m('system', 's')]);
    expect(out.map((x) => x.role)).toEqual(['system', 'user']);
  });

  it('hoists the system message in a multi-turn prompt with no leading system', () => {
    const out = hoistSystemMessagesToFront([m('user', 'u1'), m('assistant', 'a1'), m('user', 'u2'), m('system', 's')]);
    expect(out.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
    // non-system order preserved
    expect(out.slice(1).map((x) => x.tag)).toEqual(['u1', 'a1', 'u2']);
  });

  it('leaves an already-correct prompt untouched (single leading system)', () => {
    const input = [m('system', 's'), m('user', 'u1'), m('assistant', 'a1')];
    expect(hoistSystemMessagesToFront(input)).toBe(input);
  });

  it('consolidates multiple system messages at the front in order', () => {
    const out = hoistSystemMessagesToFront([m('system', 's1'), m('user', 'u1'), m('system', 's2')]);
    expect(out.map((x) => x.role)).toEqual(['system', 'system', 'user']);
    expect(out.slice(0, 2).map((x) => x.tag)).toEqual(['s1', 's2']);
  });

  it('returns the prompt unchanged when there is no system message', () => {
    const input = [m('user', 'u1'), m('assistant', 'a1')];
    expect(hoistSystemMessagesToFront(input)).toBe(input);
  });
});

// Regression test for the raw <web_search> XML leak: local models routinely
// repeat scalar (non-array) parameter tags once per <queries> entry — here
// <language> is emitted 4 times even though the schema declares it as a
// single string, not an array. This is the exact shape reported leaking to
// users in production.
const webSearchTool = {
  type: 'function',
  name: 'web_search',
  description: 'Search the web',
  inputSchema: {
    type: 'object',
    properties: {
      queries: { type: 'array', items: { type: 'string' } },
      maxResults: { type: 'array', items: { type: 'number' } },
      topics: { type: 'array', items: { type: 'string', enum: ['general', 'news'] } },
      language: { type: 'string' },
      quality: { type: 'array', items: { type: 'string', enum: ['default', 'best'] } },
      startDates: { type: 'array', items: { type: 'string', nullable: true } },
    },
  },
} as any;

const leakedText = `<web_search> <queries>offre reprise Tesla Model Y Grande Autonomie Propulsion 2026 France</queries> <queries>reprise Tesla occasion constructeur Model Y 2026 France prix</queries> <queries>prime reprise Tesla Model Y 2026 France offre</queries> <queries>estimation reprise Tesla Model Y Grande Autonomie 2026 Largus La Centrale</queries> <maxResults>8</maxResults> <maxResults>8</maxResults> <maxResults>8</maxResults> <maxResults>8</maxResults> <topics>general</topics> <topics>general</topics> <topics>general</topics> <topics>general</topics> <language>fr</language> <language>fr</language> <language>fr</language> <language>fr</language> <quality>best</quality> <quality>best</quality> <quality>best</quality> <quality>best</quality> <startDates></startDates> <startDates></startDates> <startDates></startDates> <startDates></startDates> </web_search>`;

function partsStream(parts: LanguageModelV3StreamPart[]): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<LanguageModelV3StreamPart>): Promise<LanguageModelV3StreamPart[]> {
  const reader = stream.getReader();
  const out: LanguageModelV3StreamPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out;
}

// Regression test for a real production crash: the 3-layer parserChain in
// dynamicXmlToolMiddleware re-emits redundant text-start/text-end boundaries
// with different ids around the same content. Stacked on top,
// extractReasoningMiddleware's single-slot delayedTextStart silently drops
// the first text-start and later chokes on its orphaned text-end, which
// surfaced live as `AI_UIMessageStreamError: Received text-end for missing
// text part`, crashing the whole request with "failed to pipe response".
describe('normalizeTextBoundaries', () => {
  it('collapses a redundant text-start into the already-open text part', async () => {
    const out = await collect(
      normalizeTextBoundaries(
        partsStream([
          { type: 'text-start', id: 'a' },
          { type: 'text-start', id: 'b' }, // redundant — must not open a second part
          { type: 'text-delta', id: 'b', delta: 'hello' },
          { type: 'text-end', id: 'b' },
        ]),
      ),
    );
    expect(out).toEqual([
      { type: 'text-start', id: 'a' },
      { type: 'text-delta', id: 'a', delta: 'hello' },
      { type: 'text-end', id: 'a' },
    ]);
  });

  it('drops an orphaned text-end with nothing open — the exact chunk that used to crash the response', async () => {
    const out = await collect(
      normalizeTextBoundaries(
        partsStream([
          { type: 'text-start', id: 'a' },
          { type: 'text-end', id: 'a' },
          { type: 'text-end', id: 'never-opened' }, // must be dropped, not forwarded
        ]),
      ),
    );
    expect(out).toEqual([
      { type: 'text-start', id: 'a' },
      { type: 'text-end', id: 'a' },
    ]);
  });

  it('synthesizes a text-start for an orphaned delta instead of losing real model output', async () => {
    const out = await collect(normalizeTextBoundaries(partsStream([{ type: 'text-delta', id: 'x', delta: 'salut' }])));
    expect(out).toEqual([
      { type: 'text-start', id: 'x' },
      { type: 'text-delta', id: 'x', delta: 'salut' },
    ]);
  });

  it('leaves a well-formed single text run untouched', async () => {
    const parts: LanguageModelV3StreamPart[] = [
      { type: 'text-start', id: 'a' },
      { type: 'text-delta', id: 'a', delta: 'hi' },
      { type: 'text-end', id: 'a' },
    ];
    expect(await collect(normalizeTextBoundaries(partsStream(parts)))).toEqual(parts);
  });

  it('passes non-text chunks through unchanged', async () => {
    const parts: LanguageModelV3StreamPart[] = [
      { type: 'reasoning-start', id: 'r' },
      { type: 'tool-call', toolCallId: 't1', toolName: 'web_search', input: '{}' } as LanguageModelV3StreamPart,
      { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: {} as never },
    ];
    expect(await collect(normalizeTextBoundaries(partsStream(parts)))).toEqual(parts);
  });

  it('handles the full pathological sequence: two full runs each preceded by a redundant text-start', async () => {
    const out = await collect(
      normalizeTextBoundaries(
        partsStream([
          { type: 'text-start', id: 'f99261206bbb4' },
          { type: 'text-start', id: 'txt-0' }, // redundant, from a second parser layer
          { type: 'text-delta', id: 'txt-0', delta: 'Bonjour' },
          { type: 'text-end', id: 'txt-0' },
          { type: 'text-end', id: 'de5de9feb9964' }, // orphaned, from a third layer
          { type: 'text-start', id: 'b6229d3d47a84' },
          { type: 'text-delta', id: 'b6229d3d47a84', delta: ' le monde' },
          { type: 'text-end', id: 'b6229d3d47a84' },
          { type: 'text-end', id: 'd947860d92db4' }, // orphaned again
        ]),
      ),
    );
    // Every text-end pairs with a text-start that was actually forwarded first.
    let open: string | null = null;
    for (const p of out) {
      if (p.type === 'text-start') {
        expect(open).toBeNull();
        open = p.id;
      } else if (p.type === 'text-end') {
        expect(p.id).toBe(open);
        open = null;
      }
    }
    expect(open).toBeNull();
    const text = out
      .filter((p): p is Extract<LanguageModelV3StreamPart, { type: 'text-delta' }> => p.type === 'text-delta')
      .map((p) => p.delta)
      .join('');
    expect(text).toBe('Bonjour le monde');
  });
});

describe('morphXmlProtocol duplicate scalar tag handling', () => {
  it('leaks the raw XML by default when a scalar tag is duplicated (documents the bug)', () => {
    const protocol = morphXmlProtocol({});
    const result = protocol.parseGeneratedText({ text: leakedText, tools: [webSearchTool], options: {} });
    expect(result).toEqual([{ type: 'text', text: leakedText }]);
  });

  it('parses into a tool call when duplicate string tags are tolerated (the fix)', () => {
    const protocol = morphXmlProtocol({ parseOptions: { throwOnDuplicateStringTags: false } });
    const result = protocol.parseGeneratedText({ text: leakedText, tools: [webSearchTool], options: {} });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool-call');
    const input = JSON.parse((result[0] as { input: string }).input);
    expect(input.queries).toHaveLength(4);
    expect(input.language).toBe('fr');
  });
});
