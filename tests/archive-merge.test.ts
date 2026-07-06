import { describe, it, expect } from 'vitest';
import { mergeArchiveResults, type FusedCandidate } from '@/lib/vector/archive-merge';

function candidate(overrides: Partial<FusedCandidate> = {}): FusedCandidate {
  return {
    url: 'https://example.com/a',
    title: 'Example',
    content: 'Some content',
    source: 'searxng',
    ...overrides,
  };
}

describe('mergeArchiveResults', () => {
  it('drops live searxng candidates entirely', () => {
    expect(mergeArchiveResults([candidate({ source: 'searxng' })])).toEqual([]);
  });

  it('keeps only qdrant-sourced candidates, prefixed and relabeled', () => {
    const result = mergeArchiveResults([
      candidate({ source: 'searxng', url: 'https://live.example.com' }),
      candidate({ source: 'qdrant', url: 'https://archive.example.com', title: 'Old Page' }),
    ]);

    expect(result).toEqual([
      {
        url: 'https://archive.example.com',
        title: '[Archive] Old Page',
        content: 'Some content',
        published_date: undefined,
        author: undefined,
      },
    ]);
  });

  it('returns an empty array when there are no candidates', () => {
    expect(mergeArchiveResults([])).toEqual([]);
  });

  it('never mutates the input candidates', () => {
    const input = [candidate({ source: 'qdrant' })];
    const snapshot = JSON.parse(JSON.stringify(input));
    mergeArchiveResults(input);
    expect(input).toEqual(snapshot);
  });
});
