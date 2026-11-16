import { afterEach, describe, expect, it, vi } from 'vitest';
import { rerank } from 'ai';
import { createTeiRerankingModel } from '@/lib/egress/tei-reranking-model';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTeiRerankingModel', () => {
  it("sends the query and texts to TEI's /rerank and keeps the best topN", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json([
        { index: 0, score: 0.1 },
        { index: 2, score: 0.9 },
        { index: 1, score: 0.5 },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { ranking } = await rerank({
      model: createTeiRerankingModel('http://reranker/'),
      query: 'invoice total',
      documents: ['a', 'b', 'c'],
      topN: 2,
    });

    expect(fetchMock.mock.calls[0][0]).toBe('http://reranker/rerank');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      query: 'invoice total',
      texts: ['a', 'b', 'c'],
      truncate: true,
    });
    expect(ranking.map((entry) => entry.originalIndex)).toEqual([2, 1]);
  });

  it('fails with the server status instead of returning an empty ranking', async () => {
    vi.stubGlobal('fetch', async () => new Response('model loading', { status: 503 }));
    await expect(
      rerank({ model: createTeiRerankingModel('http://reranker'), query: 'q', documents: ['a'] }),
    ).rejects.toThrow('503');
  });
});
