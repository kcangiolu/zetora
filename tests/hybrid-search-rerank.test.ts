import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateText = vi.hoisted(() => vi.fn());
const resolveTertiaryModel = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  embed: async () => ({ embedding: [0.1, 0.2] }),
  generateText,
}));
vi.mock('@/ai/embeddings', () => ({ getEmbeddingModel: async () => 'embedding-model' }));
vi.mock('@/ai/tertiary', () => ({ resolveTertiaryModel }));
vi.mock('@/lib/vector/qdrant', () => ({ getQdrantClient: () => ({ search: async () => [] }) }));

import { hybridSearch } from '@/lib/vector/hybrid-search';

const preferences = { 'zetora-hybrid-search-enabled': true, 'zetora-rerank-enabled': true };
const results = [
  { url: 'https://example.com/a', title: 'A', content: 'first' },
  { url: 'https://example.com/b', title: 'B', content: 'second' },
];

beforeEach(() => {
  vi.clearAllMocks();
  resolveTertiaryModel.mockResolvedValue('rerank-model');
});

describe('hybrid search reranking', () => {
  it('asks the model for scores without thinking, as the user', async () => {
    generateText.mockResolvedValue({ text: '[{"index":0,"score":2},{"index":1,"score":9}]' });

    const fused = await hybridSearch('query', results, preferences, 'user-1');

    expect(resolveTertiaryModel).toHaveBeenCalledWith('default', preferences, 'user-1', 'off');
    expect(fused.map((r) => r.title)).toEqual(['B', 'A']);
  });

  it('stops when the search is cancelled and keeps the fused order', async () => {
    const controller = new AbortController();
    generateText.mockImplementation(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          if (abortSignal.aborted) reject(abortSignal.reason);
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason));
        }),
    );

    const pending = hybridSearch('query', results, preferences, 'user-1', controller.signal);
    controller.abort();

    expect((await pending).map((r) => r.title)).toEqual(['A', 'B']);
  });
});
