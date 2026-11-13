import { describe, expect, it } from 'vitest';
import type { JSONSchema7 } from '@ai-sdk/provider';
import { lastUserText, wrapValuesInArrays } from '@/lib/search/tool-call-repair';

const SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    queries: { type: 'array', items: { type: 'string' } },
    maxResults: { type: 'array', items: { type: 'number' } },
    language: { type: 'string' },
  },
};

describe('wrapValuesInArrays', () => {
  it('wraps a single value given for a list', () => {
    expect(wrapValuesInArrays({ queries: 'capital of Spain', maxResults: 5, language: 'en' }, SCHEMA)).toEqual({
      queries: ['capital of Spain'],
      maxResults: [5],
      language: 'en',
    });
  });

  it('leaves a call with nothing to wrap to the repair model', () => {
    expect(wrapValuesInArrays({ queries: ['capital of Spain'], language: 'en' }, SCHEMA)).toBeNull();
    expect(wrapValuesInArrays({}, SCHEMA)).toBeNull();
    expect(wrapValuesInArrays('capital of Spain', SCHEMA)).toBeNull();
  });
});

describe('lastUserText', () => {
  it('reads the text of the last user message', () => {
    expect(
      lastUserText([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'An answer' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is the capital of Spain?' },
            { type: 'image', image: 'https://example.com/a.png' },
          ],
        },
      ]),
    ).toBe('What is the capital of Spain?');
  });

  it('is empty without a user message', () => {
    expect(lastUserText([{ role: 'assistant', content: 'Hello' }])).toBe('');
  });
});
