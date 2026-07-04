import { describe, it, expect } from 'vitest';
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
