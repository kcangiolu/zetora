import { describe, it, expect } from 'vitest';
import { APICallError } from 'ai';

import { describeSearchError, joinSearchErrors, searchErrors } from '@/lib/tools/search-errors';

describe('describeSearchError', () => {
  it('names the provider and the HTTP status of an API call error', () => {
    const error = new APICallError({
      message: 'Incorrect API key provided',
      url: 'https://api.example.com/v1/responses',
      requestBodyValues: {},
      statusCode: 401,
    });
    expect(describeSearchError('xAI', error)).toBe('xAI failed (HTTP 401): Incorrect API key provided');
  });

  it('keeps the message of any other error', () => {
    expect(describeSearchError('SearXNG', new Error('SearXNG returned 500'))).toBe(
      'SearXNG failed: SearXNG returned 500',
    );
  });

  it('truncates a long message', () => {
    const text = describeSearchError('Exa', new Error('x'.repeat(1000)));
    expect(text.length).toBe(300);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('joinSearchErrors', () => {
  it('joins the errors present and is undefined when there are none', () => {
    expect(joinSearchErrors('a failed', undefined, 'b failed')).toBe('a failed; b failed');
    expect(joinSearchErrors(undefined, undefined)).toBeUndefined();
  });
});

describe('searchErrors', () => {
  it('lists each distinct error once and ignores searches without one', () => {
    expect(
      searchErrors([{ query: 'a', error: 'xAI failed' }, { query: 'b', error: 'xAI failed' }, { query: 'c' }, null]),
    ).toEqual(['xAI failed']);
    expect(searchErrors(undefined)).toEqual([]);
  });
});
