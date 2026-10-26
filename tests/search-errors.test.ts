import { describe, it, expect, vi } from 'vitest';
import { APICallError } from 'ai';

import {
  describeSearchError,
  fallBackOnFailedQueries,
  joinSearchErrors,
  searchErrors,
  searchFailureSummary,
} from '@/lib/tools/search-errors';

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

describe('searchFailureSummary', () => {
  it('has nothing to say when every search worked', () => {
    expect(searchFailureSummary([{ query: 'a', results: [] }])).toBeNull();
  });

  it('tells a partial failure apart from a full one', () => {
    expect(searchFailureSummary([{ error: 'x' }, { query: 'b' }])).toEqual({
      failed: 1,
      total: 2,
      title: '1 of 2 searches failed',
      explanation: 'The reply uses the results of the other searches.',
    });
    expect(searchFailureSummary([{ error: 'x' }])?.title).toBe('Search failed');
  });
});

describe('fallBackOnFailedQueries', () => {
  type Search = { query: string; results: { url: string }[]; error?: string };
  const ok = (query: string): Search => ({ query, results: [{ url: `https://example.com/${query}` }] });

  it('leaves the searches alone when none failed', async () => {
    const runFallback = vi.fn();
    const searches = [ok('a'), ok('b')];
    expect(await fallBackOnFailedQueries(searches, runFallback)).toBe(searches);
    expect(runFallback).not.toHaveBeenCalled();
  });

  it('runs the fallback on the failed queries only and puts its results in their place', async () => {
    const runFallback = vi.fn(async () => [ok('b'), { query: 'c', results: [], error: 'Exa failed: quota' }]);
    const merged = await fallBackOnFailedQueries(
      [
        ok('a'),
        { query: 'b', results: [], error: 'SearXNG failed: timeout' },
        { query: 'c', results: [], error: 'SearXNG failed: timeout' },
      ],
      runFallback,
    );

    expect(runFallback).toHaveBeenCalledWith([1, 2]);
    expect(merged[0]).toEqual(ok('a'));
    expect(merged[1]).toEqual({ ...ok('b'), error: undefined });
    expect(merged[2].error).toBe('SearXNG failed: timeout; Exa failed: quota');
  });
});
