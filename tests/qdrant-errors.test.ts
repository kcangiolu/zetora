import { describe, it, expect } from 'vitest';

import { describeQdrantError } from '@/lib/vector/qdrant';

describe('describeQdrantError', () => {
  it('says the index was built with another embedding model and how to rebuild it', () => {
    const error = { status: { error: 'Wrong input: Vector dimension error: expected dim: 768, got 1024' }, time: 0 };
    expect(describeQdrantError('upsert', 'search_index', error)).toBe(
      'Qdrant collection search_index holds 768-dimension vectors but the Search Embedding model gives 1024: ' +
        'it was built with another model. Delete the collection to rebuild it (DELETE /collections/search_index on Qdrant).',
    );
  });

  it('keeps any other error as Qdrant sent it', () => {
    expect(describeQdrantError('search', 'search_index', { status: { error: 'Not found' } })).toBe(
      'Failed to search: {"status":{"error":"Not found"}}',
    );
  });
});
