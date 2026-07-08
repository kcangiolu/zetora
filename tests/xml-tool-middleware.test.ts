import { describe, it, expect } from 'vitest';
import { morphXmlProtocol } from '@ai-sdk-tool/parser';
import { hoistSystemMessagesToFront } from '@/ai/xml-tool-middleware';

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
