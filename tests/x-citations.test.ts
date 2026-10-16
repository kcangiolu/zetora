import { describe, it, expect, vi, afterEach } from 'vitest';

const getTweetMock = vi.hoisted(() => vi.fn());

vi.mock('react-tweet/api', () => ({ getTweet: getTweetMock }));

import { dedupeCitations, hydrateXPosts, resolveXSearchDateRange, sanitizeXHandles } from '@/lib/tools/x-citations';

afterEach(() => {
  getTweetMock.mockReset();
  vi.useRealTimers();
});

describe('sanitizeXHandles', () => {
  it('strips leading @ and drops empty handles', () => {
    expect(sanitizeXHandles(['@@elonmusk', ' nasa ', '@'])).toEqual(['elonmusk', 'nasa']);
    expect(sanitizeXHandles(undefined)).toBeUndefined();
  });
});

describe('resolveXSearchDateRange', () => {
  it('defaults to the last 15 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    expect(resolveXSearchDateRange()).toEqual({ start: '2026-10-01', end: '2026-10-16' });
    expect(resolveXSearchDateRange(' ', '2026-10-10')).toEqual({ start: '2026-10-01', end: '2026-10-10' });
  });
});

describe('dedupeCitations', () => {
  it('collapses the same post under different URLs and keeps non-URL citations', () => {
    const citations = [
      { sourceType: 'url', url: 'https://x.com/a/status/1' },
      { sourceType: 'url', url: 'https://twitter.com/b/status/1?s=20' },
      { sourceType: 'document' },
      { sourceType: 'url', url: 'https://x.com/a/status/2' },
    ];
    expect(dedupeCitations(citations)).toEqual([citations[0], citations[2], citations[3]]);
  });
});

describe('hydrateXPosts', () => {
  it('fetches each post once and drops posts that cannot be fetched', async () => {
    getTweetMock.mockImplementation(async (id: string) => {
      if (id === '2') throw new Error('gone');
      return { text: `post ${id}`, user: { screen_name: 'nasa' }, created_at: '2026-10-01' };
    });

    const posts = await hydrateXPosts([
      { sourceType: 'url', url: 'https://x.com/nasa/status/1' },
      { sourceType: 'url', url: 'https://twitter.com/nasa/status/1' },
      { sourceType: 'url', url: 'https://x.com/nasa/status/2' },
      { sourceType: 'url', url: 'https://example.com/no-post' },
    ]);

    expect(getTweetMock).toHaveBeenCalledTimes(2);
    expect(posts).toEqual([
      {
        text: 'post 1',
        link: 'https://x.com/i/status/1',
        id: '1',
        author: '@nasa',
        publishedDate: '2026-10-01',
        title: 'Post from @nasa',
      },
    ]);
  });
});
